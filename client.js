// Sidebar plugin fold — folds the plugin entries in the left sidebar, keeps
// them reachable from the sidebar's More menu, and lets the user reorder them.
//
// The sidebar owns the panel list and hides a row when that panel is
// "unpinned"; the unpinned set lives in the sidebar's own in-memory store and
// the More menu (`sidebar.panellist.actions`) is the only seat that may change
// it. This plugin therefore renders one section inside that menu: a switch
// per plugin panel, plus "collapse all" / "expand all". The chosen set is
// kept in localStorage and restored the next time the menu opens, because the
// sidebar forgets its unpinned set whenever the page reloads.
//
// Reordering needs the same panel list. The sidebar sorts it by each entry's
// `order` option, and an entry's options belong to the plugin that registered
// it — a third party cannot edit them. What a plugin can do is register its
// own entry for the same id at a different priority: the slot keeps the first
// entry per id, and the lower priority renders first. So this plugin
// registers a shadow of every panel entry (same component, same label, its
// own `order`) whenever the user has chosen an order, and drops the shadows
// again when the order is reset.

window.__ModuleLoader__.load({
  id: '@local/sidebar-plugin-fold',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'sidebarPluginFold';
    const STORAGE_KEY = 'dsh.sidebar.plugin-fold.v1';
    const ORDER_KEY = '{{SECRET_i7o3hugf}}';
    const REGISTRANT = '@local/sidebar-plugin-fold';
    // Below the priority every shipped panel entry uses (0), so a shadow
    // always wins its cell in the slot's per-id selection.
    const SHADOW_PRIORITY = -1;

    const CSS = `
.spf-group{display:flex;flex-direction:column;gap:2px;min-width:248px}
.spf-header{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:4px 12px 6px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.spf-headerCount{color:var(--dsw-alias-label-tertiary)}
.spf-action{display:flex;align-items:center;gap:8px;width:100%;border:0;background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;line-height:18px;text-align:left;padding:6px 12px;border-radius:6px;cursor:pointer}
.spf-action:hover{background:var(--dsw-alias-interactive-bg-hover)}
.spf-sep{height:1px;margin:6px 8px;background:var(--dsw-alias-border-l1)}
.spf-row{display:flex;align-items:center;gap:2px}
.spf-toggle{flex:1 1 auto;display:flex;align-items:center;gap:8px;min-width:0;border:0;background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;line-height:18px;text-align:left;padding:6px 12px;border-radius:6px;cursor:pointer}
.spf-toggle:hover{background:var(--dsw-alias-interactive-bg-hover)}
.spf-box{flex:none;display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:4px;border:1.5px solid var(--dsw-alias-border-l2);color:#fff;font-size:10px;line-height:1}
.spf-box[data-on="true"]{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}
.spf-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.spf-name[data-hidden="true"]{color:var(--dsw-alias-label-tertiary)}
.spf-open{flex:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;padding:6px 10px;border-radius:6px;cursor:pointer}
.spf-open:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.spf-move{flex:none;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1;cursor:pointer}
.spf-move:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.spf-move:disabled{opacity:.35;cursor:default}
.spf-orderName{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;line-height:18px;color:var(--dsw-alias-label-primary);padding:0 4px}
.spf-empty{padding:6px 12px;font-size:12px;color:var(--dsw-alias-label-tertiary)}
.spf-note{padding:2px 12px 6px;font-size:11px;color:var(--dsw-alias-label-tertiary)}
`;

    function injectStyles() {
      if (typeof document === 'undefined') return;
      const tagId = '@local/sidebar-plugin-fold/fold.css';
      if (document.querySelector(`style[data-plugin-css="${tagId}"]`) !== null) return;
      const tag = document.createElement('style');
      tag.dataset.plugin = '@local/sidebar-plugin-fold';
      tag.dataset.pluginCss = tagId;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    function readList(key) {
      try {
        const raw = window.localStorage.getItem(key);
        if (raw === null) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
      } catch {
        return [];
      }
    }

    function writeList(key, ids) {
      try {
        window.localStorage.setItem(key, JSON.stringify(ids));
      } catch {
        // A private-mode browser may refuse storage; the fold still works for this page.
      }
    }

    /** A minimal snapshot store the menu rows subscribe to. */
    function createStore(initial) {
      let snapshot = initial;
      const listeners = new Set();
      return {
        getSnapshot: () => snapshot,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => { listeners.delete(listener); };
        },
        set: (next) => {
          snapshot = next;
          for (const listener of [...listeners]) listener();
        },
      };
    }

    /**
     * The More-menu section: one switch per plugin panel, one order control
     * per panel, plus collapse-all.
     * @param props - Owner callbacks, the panel order store, and localized copy.
     * @returns The menu rows of the fold and order sections.
     */
    function FoldMenu(props) {
      const { entries, onOpen, onPinnedChange, onDismiss, t, panels, onMove, onResetOrder } = props;
      const list = Array.isArray(entries) ? entries : [];
      const order = React.useSyncExternalStore(panels.subscribe, panels.getSnapshot, panels.getSnapshot);

      // The sidebar forgets its unpinned set on every reload; restore the
      // remembered folds as soon as this menu opens.
      const [restored, setRestored] = React.useState(0);
      React.useEffect(() => {
        const stored = readList(STORAGE_KEY);
        if (stored.length === 0) return;
        let applied = 0;
        for (const entry of list) {
          if (entry.pinned && stored.includes(entry.id)) {
            onPinnedChange(entry.id, false);
            applied += 1;
          }
        }
        if (applied > 0) setRestored(applied);
        // Restoring runs once per menu opening; later changes come from the user.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      const hiddenOf = (rows) => rows.filter((entry) => entry.pinned === false).map((entry) => entry.id);

      const setHidden = (ids) => {
        writeList(STORAGE_KEY, ids);
        for (const entry of list) {
          const shouldShow = !ids.includes(entry.id);
          if (entry.pinned !== shouldShow) onPinnedChange(entry.id, shouldShow);
        }
      };

      const toggle = (entry) => {
        const hidden = hiddenOf(list);
        const next = entry.pinned
          ? [...hidden, entry.id]
          : hidden.filter((id) => id !== entry.id);
        setHidden(next);
      };

      const allHidden = list.length > 0 && list.every((entry) => entry.pinned === false);
      const visible = list.filter((entry) => entry.pinned !== false).length;

      return h('div', { className: 'spf-group', role: 'group', 'aria-label': t('group') },
        h('div', { className: 'spf-header' },
          h('span', null, t('group')),
          h('span', { className: 'spf-headerCount' }, t('count', { visible, total: list.length }))),
        h('div', { className: 'spf-sep' }),
        list.length === 0
          ? h('div', { className: 'spf-empty' }, t('empty'))
          : h('div', null, list.map((entry) => h('div', { className: 'spf-row', key: entry.id },
            h('button', {
              type: 'button',
              role: 'menuitemcheckbox',
              'aria-checked': entry.pinned !== false,
              className: 'spf-toggle',
              onClick: () => toggle(entry),
            },
              h('span', { className: 'spf-box', 'data-on': entry.pinned !== false ? 'true' : 'false', 'aria-hidden': 'true' },
                entry.pinned !== false ? '✓' : ''),
              h('span', { className: 'spf-name', 'data-hidden': entry.pinned === false ? 'true' : 'false' }, entry.label)),
            h('button', {
              type: 'button',
              role: 'menuitem',
              className: 'spf-open',
              title: t('open'),
              onClick: () => {
                onOpen(entry.id);
                onDismiss();
              },
            }, t('open'))))),
        h('div', { className: 'spf-sep' }),
        h('button', {
          type: 'button',
          role: 'menuitem',
          className: 'spf-action',
          onClick: () => setHidden(allHidden ? [] : list.map((entry) => entry.id)),
        }, allHidden ? t('expandAll') : t('collapseAll')),
        h('div', { className: 'spf-sep' }),
        h('div', { className: 'spf-header' },
          h('span', null, t('orderGroup')),
          h('button', {
            type: 'button',
            className: 'spf-move',
            title: t('resetOrder'),
            'aria-label': t('resetOrder'),
            onClick: () => onResetOrder(),
          }, '↺')),
        order.length === 0
          ? h('div', { className: 'spf-empty' }, t('emptyOrder'))
          : h('div', null, order.map((panel, index) => h('div', { className: 'spf-row', key: panel.id },
            h('button', {
              type: 'button',
              role: 'menuitem',
              className: 'spf-move',
              'aria-label': `${t('moveUp')}: ${panel.label}`,
              title: t('moveUp'),
              disabled: index === 0,
              onClick: () => onMove(panel.id, -1),
            }, '↑'),
            h('span', { className: 'spf-orderName' }, panel.label),
            h('button', {
              type: 'button',
              role: 'menuitem',
              className: 'spf-move',
              'aria-label': `${t('moveDown')}: ${panel.label}`,
              title: t('moveDown'),
              disabled: index === order.length - 1,
              onClick: () => onMove(panel.id, 1),
            }, '↓')))),
        restored > 0 ? h('div', { className: 'spf-note' }, t('restored', { count: restored })) : null);
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, {
          zh: {
            group: '侧栏插件入口',
            count: '显示 {visible}/{total}',
            empty: '当前没有可折叠的插件入口。',
            restored: '已恢复上次的折叠（{count} 项）',
            open: '打开',
            collapseAll: '全部收起',
            expandAll: '全部展开',
            orderGroup: '调整顺序',
            orderEmpty: '当前没有可排序的插件入口。',
            moveUp: '上移',
            moveDown: '下移',
            resetOrder: '恢复默认顺序',
          },
          en: {
            group: 'Sidebar plugin entries',
            count: 'showing {visible}/{total}',
            empty: 'No plugin entry can be folded right now.',
            restored: 'Restored your last fold ({count} hidden)',
            open: 'Open',
            collapseAll: 'Collapse all',
            expandAll: 'Expand all',
            orderGroup: 'Reorder entries',
            orderEmpty: 'No plugin entry can be reordered right now.',
            moveUp: 'Move up',
            moveDown: 'Move down',
            resetOrder: 'Reset order',
          },
          ja: {
            group: 'サイドバーのプラグイン項目',
            count: '{visible}/{total} 件を表示',
            empty: '折りたたみ可能なプラグイン項目はありません。',
            restored: '前回の折りたたみを復元しました（{count} 件）',
            open: '開く',
            collapseAll: 'すべて折りたたむ',
            expandAll: 'すべて展開',
            orderGroup: '並び順を変更',
            orderEmpty: '並べ替えできるプラグイン項目はありません。',
            moveUp: '上へ',
            moveDown: '下へ',
            resetOrder: '既定の順序に戻す',
          },
          es: {
            group: 'Entradas de complementos en la barra lateral',
            count: 'mostrando {visible}/{total}',
            empty: 'Ahora mismo no hay entradas de complemento que plegar.',
            restored: 'Se restauró tu último plegado ({count} ocultos)',
            open: 'Abrir',
            collapseAll: 'Plegar todo',
            expandAll: 'Desplegar todo',
            orderGroup: 'Reordenar entradas',
            orderEmpty: 'Ahora mismo no hay entradas que reordenar.',
            moveUp: 'Subir',
            moveDown: 'Bajar',
            resetOrder: 'Restablecer el orden',
          },
          fr: {
            group: 'Entrées de plugins de la barre latérale',
            count: '{visible}/{total} affichées',
            empty: 'Aucune entrée de plugin à replier pour le moment.',
            restored: 'Votre dernier repli a été restauré ({count} masqués)',
            open: 'Ouvrir',
            collapseAll: 'Tout replier',
            expandAll: 'Tout déplier',
            orderGroup: 'Réordonner les entrées',
            orderEmpty: 'Aucune entrée à réordonner pour le moment.',
            moveUp: 'Monter',
            moveDown: 'Descendre',
            resetOrder: 'Réinitialiser l\'ordre',
          },
          de: {
            group: 'Plugin-Einträge der Seitenleiste',
            count: '{visible}/{total} sichtbar',
            empty: 'Zurzeit gibt es keinen Plugin-Eintrag zum Einklappen.',
            restored: 'Letzte Einklappung wiederhergestellt ({count} ausgeblendet)',
            open: 'Öffnen',
            collapseAll: 'Alle einklappen',
            expandAll: 'Alle ausklappen',
            orderGroup: 'Einträge umsortieren',
            orderEmpty: 'Zurzeit gibt es keinen Eintrag zum Umsortieren.',
            moveUp: 'Nach oben',
            moveDown: 'Nach unten',
            resetOrder: 'Reihenfolge zurücksetzen',
          },
          ru: {
            group: 'Записи плагинов на боковой панели',
            count: 'показано {visible}/{total}',
            empty: 'Сейчас нет записей плагинов для сворачивания.',
            restored: 'Восстановлено последнее сворачивание ({count} скрыто)',
            open: 'Открыть',
            collapseAll: 'Свернуть все',
            expandAll: 'Развернуть все',
            orderGroup: 'Изменить порядок',
            orderEmpty: 'Сейчас нет записей для сортировки.',
            moveUp: 'Выше',
            moveDown: 'Ниже',
            resetOrder: 'Сбросить порядок',
          },
          pt: {
            group: 'Entradas de plug-ins na barra lateral',
            count: 'mostrando {visible}/{total}',
            empty: 'No momento não há entradas de plug-in para recolher.',
            restored: 'Recolhimento anterior restaurado ({count} ocultos)',
            open: 'Abrir',
            collapseAll: 'Recolher tudo',
            expandAll: 'Expandir tudo',
            orderGroup: 'Reordenar entradas',
            orderEmpty: 'No momento não há entradas para reordenar.',
            moveUp: 'Subir',
            moveDown: 'Descer',
            resetOrder: 'Restaurar a ordem',
          },
        }), 'sidebar-plugin-fold: dictionaries');

        injectStyles();

        // The panel list the order section shows, and the shadow entries that
        // give the sidebar the order the user chose.
        const panels = createStore([]);
        const shadowDisposers = [];
        let lastOriginals = new Map();

        const originalsOf = () => {
          const map = new Map();
          for (const entry of ctx.slots.entries('sidebar.panellist')) {
            if (entry.registrant === REGISTRANT) continue;
            map.set(entry.options.id, entry);
          }
          return map;
        };

        const labelOf = (entry) => {
          const label = entry.options.label;
          if (typeof label === 'function') {
            try {
              return label();
            } catch {
              return undefined;
            }
          }
          return typeof label === 'string' ? label : undefined;
        };

        const desiredOrder = (originals) => {
          const ids = [...originals.keys()];
          const stored = readList(ORDER_KEY).filter((id) => ids.includes(id));
          const rest = ids
            .filter((id) => !stored.includes(id))
            .sort((a, b) => (originals.get(a).options.order ?? 0) - (originals.get(b).options.order ?? 0));
          return [...stored, ...rest];
        };

        const disposeShadows = () => {
          for (const dispose of shadowDisposers.splice(0)) {
            try {
              dispose();
            } catch {
              // The slot may already have collapsed; the entry is gone anyway.
            }
          }
        };

        const rebuildShadows = () => {
          disposeShadows();
          const originals = originalsOf();
          const desired = desiredOrder(originals);
          const stored = readList(ORDER_KEY);
          if (stored.length > 0) {
            desired.forEach((id, index) => {
              const original = originals.get(id);
              if (original === undefined) return;
              const options = original.options;
              // A panel that owns child slots or a store handle cannot be
              // shadowed: the slot system allows one declaration of each.
              if (options.children !== undefined || options.store !== undefined) return;
              try {
                const dispose = ctx.slots.register({
                  name: 'sidebar.panellist',
                  id,
                  order: index,
                  priority: SHADOW_PRIORITY,
                  label: options.label,
                  registrant: REGISTRANT,
                }, original.component);
                shadowDisposers.push(dispose);
              } catch (error) {
                console.warn('[sidebar-plugin-fold] could not take over panel', id, error);
              }
            });
          }
          lastOriginals = originals;
          panels.set(desired.map((id) => ({
            id,
            label: labelOf(originals.get(id)) ?? id,
          })));
        };

        const sameOriginals = (a, b) => {
          if (a.size !== b.size) return false;
          for (const [id, entry] of a) {
            const other = b.get(id);
            if (other === undefined || other.component !== entry.component) return false;
          }
          return true;
        };

        const move = (id, delta) => {
          const originals = originalsOf();
          const desired = desiredOrder(originals);
          const index = desired.indexOf(id);
          const target = index + delta;
          if (index < 0 || target < 0 || target >= desired.length) return;
          const next = [...desired];
          const [moved] = next.splice(index, 1);
          next.splice(target, 0, moved);
          writeList(ORDER_KEY, next);
          rebuildShadows();
        };

        const resetOrder = () => {
          writeList(ORDER_KEY, []);
          rebuildShadows();
        };

        ctx.effect(() => {
          const dispose = ctx.slots.inject('sidebar.panellist', () => {
            const unsubscribe = ctx.slots.subscribe('sidebar.panellist', () => {
              const originals = originalsOf();
              if (sameOriginals(originals, lastOriginals)) return;
              rebuildShadows();
            });
            rebuildShadows();
            return () => {
              unsubscribe();
              disposeShadows();
            };
          });
          return () => dispose();
        }, 'sidebar-plugin-fold: panel order');

        ctx.effect(() => {
          const dispose = ctx.slots.inject('sidebar.panellist.actions', () => ctx.slots.register({
            name: 'sidebar.panellist.actions',
            id: 'sidebar-plugin-fold',
            order: -10,
            locale: NS,
            inject: () => ({
              t: ctx.locale.bind(NS),
              panels,
              onMove: move,
              onResetOrder: resetOrder,
            }),
          }, FoldMenu));
          return () => dispose();
        }, 'sidebar-plugin-fold: menu registration');
      },
    };
  },
});

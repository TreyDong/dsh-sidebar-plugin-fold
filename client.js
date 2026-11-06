// Sidebar plugin fold — hides the plugin rows in the left sidebar and keeps
// them reachable from the sidebar's More menu.
//
// The sidebar owns the panel list and hides a row when that panel is
// "unpinned"; the unpinned set lives in the sidebar's own in-memory store and
// the More menu (`sidebar.panellist.actions`) is the only seat that may change
// it. This plugin therefore renders one section inside that menu: a switch
// per plugin panel, plus "collapse all" / "expand all". The chosen set is
// kept in localStorage and restored the next time the menu opens, because the
// sidebar forgets its unpinned set whenever the page reloads.

window.__ModuleLoader__.load({
  id: '@local/sidebar-plugin-fold',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'sidebarPluginFold';
    const STORAGE_KEY = 'dsh.sidebar.plugin-fold.v1';

    const CSS = `
.spf-group{display:flex;flex-direction:column;gap:2px;min-width:232px}
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

    function readHidden() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw === null) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
      } catch {
        return [];
      }
    }

    function writeHidden(ids) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
      } catch {
        // A private-mode browser may refuse storage; the fold still works for this page.
      }
    }

    /**
     * The More-menu section: one switch per plugin panel plus collapse-all.
     * @param props - Owner callbacks (open, pin change, dismiss) and localized copy.
     * @returns The menu rows of the fold section.
     */
    function FoldMenu(props) {
      const { entries, onOpen, onPinnedChange, onDismiss, t } = props;
      const list = Array.isArray(entries) ? entries : [];

      // The sidebar forgets its unpinned set on every reload; restore the
      // remembered folds as soon as this menu opens.
      const [restored, setRestored] = React.useState(0);
      React.useEffect(() => {
        const stored = readHidden();
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
        writeHidden(ids);
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
        restored > 0 ? h('div', { className: 'spf-note' }, t('restored', { count: restored })) : null,
        h('button', {
          type: 'button',
          role: 'menuitem',
          className: 'spf-action',
          onClick: () => setHidden(allHidden ? [] : list.map((entry) => entry.id)),
        }, allHidden ? t('expandAll') : t('collapseAll')));
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
          },
          en: {
            group: 'Sidebar plugin entries',
            count: 'showing {visible}/{total}',
            empty: 'No plugin entry can be folded right now.',
            restored: 'Restored your last fold ({count} hidden)',
            open: 'Open',
            collapseAll: 'Collapse all',
            expandAll: 'Expand all',
          },
          ja: {
            group: 'サイドバーのプラグイン項目',
            count: '{visible}/{total} 件を表示',
            empty: '折りたたみ可能なプラグイン項目はありません。',
            restored: '前回の折りたたみを復元しました（{count} 件）',
            open: '開く',
            collapseAll: 'すべて折りたたむ',
            expandAll: 'すべて展開',
          },
          es: {
            group: 'Entradas de complementos en la barra lateral',
            count: 'mostrando {visible}/{total}',
            empty: 'Ahora mismo no hay entradas de complemento que plegar.',
            restored: 'Se restauró tu último plegado ({count} ocultos)',
            open: 'Abrir',
            collapseAll: 'Plegar todo',
            expandAll: 'Desplegar todo',
          },
          fr: {
            group: 'Entrées de plugins de la barre latérale',
            count: '{visible}/{total} affichées',
            empty: 'Aucune entrée de plugin à replier pour le moment.',
            restored: 'Votre dernier repli a été restauré ({count} masqués)',
            open: 'Ouvrir',
            collapseAll: 'Tout replier',
            expandAll: 'Tout déplier',
          },
          de: {
            group: 'Plugin-Einträge der Seitenleiste',
            count: '{visible}/{total} sichtbar',
            empty: 'Zurzeit gibt es keinen Plugin-Eintrag zum Einklappen.',
            restored: 'Letzte Einklappung wiederhergestellt ({count} ausgeblendet)',
            open: 'Öffnen',
            collapseAll: 'Alle einklappen',
            expandAll: 'Alle ausklappen',
          },
          ru: {
            group: 'Записи плагинов на боковой панели',
            count: 'показано {visible}/{total}',
            empty: 'Сейчас нет записей плагинов для сворачивания.',
            restored: 'Восстановлено последнее сворачивание ({count} скрыто)',
            open: 'Открыть',
            collapseAll: 'Свернуть все',
            expandAll: 'Развернуть все',
          },
          pt: {
            group: 'Entradas de plug-ins na barra lateral',
            count: 'mostrando {visible}/{total}',
            empty: 'No momento não há entradas de plug-in para recolher.',
            restored: 'Recolhimento anterior restaurado ({count} ocultos)',
            open: 'Abrir',
            collapseAll: 'Recolher tudo',
            expandAll: 'Expandir tudo',
          },
        }), 'sidebar-plugin-fold: dictionaries');

        injectStyles();

        ctx.effect(() => {
          const dispose = ctx.slots.inject('sidebar.panellist.actions', () => ctx.slots.register({
            name: 'sidebar.panellist.actions',
            id: 'sidebar-plugin-fold',
            order: -10,
            locale: NS,
            inject: () => ({
              t: ctx.locale.bind(NS),
            }),
          }, FoldMenu));
          return () => dispose();
        }, 'sidebar-plugin-fold: menu registration');
      },
    };
  },
});

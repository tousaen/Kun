import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { DesktopCommand } from '@shared/kun-gui-api'
import {
  resolveDesktopTitleBarMode,
  usesCustomDesktopTitleBar,
  type DesktopTitleBarMode
} from '@shared/desktop-title-bar'
import {
  resolveKeyboardShortcutBindings,
  type KeyboardShortcutBindingsV1,
  type KeyboardShortcutCommandId
} from '@shared/keyboard-shortcuts'
import kunLogo from '../../../asset/img/kun.png'
import { useKeyboardShortcutSettings } from '../lib/keyboard-shortcut-settings'
import { useChatStore } from '../store/chat-store'

type MenuAction = () => void | Promise<void>
type TitleBarTranslate = (key: string, options?: Record<string, unknown>) => string

/** popover 与菜单按钮之间的垂直间距（px），与 CSS 中的 calc(100% + 5px) 对齐。 */
const MENU_POPOVER_GAP = 5

export type WindowsTitleBarMenuItem =
  | {
      kind?: 'item'
      id: string
      label: string
      shortcut?: string
      onSelect: MenuAction
    }
  | {
      kind: 'separator'
      id: string
    }

export type WindowsTitleBarMenuSection = {
  id: string
  label: string
  items: WindowsTitleBarMenuItem[]
}

export type WindowsTitleBarActions = {
  createThread: MenuAction
  chooseWorkspace: MenuAction
  openSettings: MenuAction
  runDesktopCommand: (command: DesktopCommand) => void | Promise<void>
  openLogDir: MenuAction
  showAbout: MenuAction
}

type Props = {
  platform?: string
  actions?: Partial<WindowsTitleBarActions>
}

function currentPlatform(): string {
  return typeof window !== 'undefined' ? window.kunGui?.platform ?? 'unknown' : 'unknown'
}

function defaultRunDesktopCommand(command: DesktopCommand): Promise<void> {
  if (typeof window === 'undefined' || typeof window.kunGui?.runDesktopCommand !== 'function') {
    return Promise.resolve()
  }
  return window.kunGui.runDesktopCommand(command)
}

function defaultOpenLogDir(): Promise<void> {
  if (typeof window === 'undefined' || typeof window.kunGui?.openLogDir !== 'function') {
    return Promise.resolve()
  }
  return window.kunGui.openLogDir().then(() => undefined)
}

export function supportsDesktopTitleBar(
  platform: string,
  mode: DesktopTitleBarMode = resolveDesktopTitleBarMode(platform, false)
): boolean {
  return usesCustomDesktopTitleBar(platform, mode)
}

export function buildWindowsTitleBarMenuSections(
  t: TitleBarTranslate,
  actions: WindowsTitleBarActions,
  shortcuts: Required<KeyboardShortcutBindingsV1> = resolveKeyboardShortcutBindings(undefined, currentPlatform())
): WindowsTitleBarMenuSection[] {
  const command = (desktopCommand: DesktopCommand): MenuAction =>
    () => actions.runDesktopCommand(desktopCommand)
  const shortcut = (commandId: KeyboardShortcutCommandId): string | undefined =>
    shortcuts[commandId][0]

  return [
    {
      id: 'file',
      label: t('windowsMenuFile'),
      items: [
        { id: 'new-chat', label: t('windowsMenuNewChat'), shortcut: shortcut('new-chat'), onSelect: actions.createThread },
        { id: 'choose-workspace', label: t('windowsMenuChooseWorkspace'), shortcut: shortcut('choose-workspace'), onSelect: actions.chooseWorkspace },
        { kind: 'separator', id: 'file-1' },
        { id: 'settings', label: t('windowsMenuSettings'), shortcut: shortcut('settings'), onSelect: actions.openSettings },
        { kind: 'separator', id: 'file-2' },
        { id: 'quit', label: t('windowsMenuQuit'), shortcut: shortcut('quit'), onSelect: command('quit') }
      ]
    },
    {
      id: 'edit',
      label: t('windowsMenuEdit'),
      items: [
        { id: 'undo', label: t('windowsMenuUndo'), shortcut: shortcut('undo'), onSelect: command('undo') },
        { id: 'redo', label: t('windowsMenuRedo'), shortcut: shortcut('redo'), onSelect: command('redo') },
        { kind: 'separator', id: 'edit-1' },
        { id: 'cut', label: t('windowsMenuCut'), shortcut: shortcut('cut'), onSelect: command('cut') },
        { id: 'copy', label: t('windowsMenuCopy'), shortcut: shortcut('copy'), onSelect: command('copy') },
        { id: 'paste', label: t('windowsMenuPaste'), shortcut: shortcut('paste'), onSelect: command('paste') },
        { kind: 'separator', id: 'edit-2' },
        { id: 'select-all', label: t('windowsMenuSelectAll'), shortcut: shortcut('select-all'), onSelect: command('selectAll') }
      ]
    },
    {
      id: 'view',
      label: t('windowsMenuView'),
      items: [
        { id: 'reload', label: t('windowsMenuReload'), shortcut: shortcut('reload'), onSelect: command('reload') },
        { kind: 'separator', id: 'view-1' },
        { id: 'zoom-in', label: t('windowsMenuZoomIn'), shortcut: shortcut('zoom-in'), onSelect: command('zoomIn') },
        { id: 'zoom-out', label: t('windowsMenuZoomOut'), shortcut: shortcut('zoom-out'), onSelect: command('zoomOut') },
        { id: 'reset-zoom', label: t('windowsMenuResetZoom'), shortcut: shortcut('reset-zoom'), onSelect: command('resetZoom') },
        { kind: 'separator', id: 'view-2' },
        { id: 'devtools', label: t('windowsMenuDevTools'), shortcut: shortcut('toggle-devtools'), onSelect: command('toggleDevTools') }
      ]
    },
    {
      id: 'window',
      label: t('windowsMenuWindow'),
      items: [
        { id: 'minimize', label: t('windowsMenuMinimize'), onSelect: command('minimize') },
        { id: 'maximize', label: t('windowsMenuToggleMaximize'), onSelect: command('toggleMaximize') },
        { id: 'close', label: t('windowsMenuClose'), shortcut: shortcut('close'), onSelect: command('close') }
      ]
    },
    {
      id: 'help',
      label: t('windowsMenuHelp'),
      items: [
        { id: 'about', label: t('windowsMenuAbout'), onSelect: actions.showAbout },
        { id: 'open-log-dir', label: t('windowsMenuOpenLogDir'), onSelect: actions.openLogDir }
      ]
    }
  ]
}

/* ---------- SVG window-control icons (10×10 viewBox) ---------- */

function MinimizeIcon(): ReactElement {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M1 5h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function MaximizeIcon(): ReactElement {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function RestoreIcon(): ReactElement {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <rect x="1.5" y="2.5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.1" />
      <path d="M3.5 2.5V1.8a.8.8 0 0 1 .8-.8h4.4a.8.8 0 0 1 .8.8v4.4a.8.8 0 0 1-.8.8H8" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  )
}

function CloseIcon(): ReactElement {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

export function WindowsTitleBar({ platform, actions }: Props): ReactElement | null {
  const resolvedPlatform = platform ?? currentPlatform()
  const { t } = useTranslation('common')
  const createThread = useChatStore((s) => s.createThread)
  const chooseWorkspace = useChatStore((s) => s.chooseWorkspace)
  const openSettings = useChatStore((s) => s.openSettings)
  const keyboardShortcuts = useKeyboardShortcutSettings()
  const keyboardShortcutBindings = useMemo(
    () => resolveKeyboardShortcutBindings(keyboardShortcuts, resolvedPlatform),
    [keyboardShortcuts, resolvedPlatform]
  )
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null)
  // 记录打开菜单时按钮的视口坐标，用于将 popover 以 fixed 定位渲染到
  // document.body（脱离标题栏 drag 区域与 stacking context）。
  const [menuAnchor, setMenuAnchor] = useState<{ left: number; bottom: number } | null>(null)
  const [isMaximized, setIsMaximized] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  // popover 通过 portal 渲染到 document.body，需单独记录引用，
  // 供外部点击关闭逻辑识别"popover 内部点击"。
  const popoverRef = useRef<HTMLDivElement>(null)

  /**
   * @brief 打开菜单并记录触发按钮的视口坐标。
   *
   * popover 通过 createPortal 挂载到 document.body 后，需用按钮的
   * getBoundingClientRect()（视口坐标）配合 position: fixed 定位，
   * 保持与按钮左对齐、出现在按钮下方 5px 处。
   *
   * @param menuId 要打开的菜单 id
   * @param button 触发菜单的按钮元素
   */
  const openMenu = (menuId: string, button: HTMLButtonElement): void => {
    const rect = button.getBoundingClientRect()
    setMenuAnchor({ left: rect.left, bottom: rect.bottom })
    setActiveMenuId(menuId)
  }

  const defaultActions = useMemo<WindowsTitleBarActions>(() => ({
    createThread: () => void createThread(),
    chooseWorkspace: () => void chooseWorkspace(),
    openSettings: () => openSettings('general'),
    runDesktopCommand: defaultRunDesktopCommand,
    openLogDir: defaultOpenLogDir,
    showAbout: async () => {
      const version =
        typeof window !== 'undefined' && typeof window.kunGui?.getAppVersion === 'function'
          ? await window.kunGui.getAppVersion().catch(() => '')
          : ''
      const message = t('windowsMenuAboutMessage', {
        version: version || t('windowsMenuUnknownVersion')
      })
      if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert(message)
      }
    }
  }), [chooseWorkspace, createThread, openSettings, t])

  const resolvedActions = useMemo<WindowsTitleBarActions>(() => ({
    ...defaultActions,
    ...actions
  }), [actions, defaultActions])

  const menus = useMemo(
    () => buildWindowsTitleBarMenuSections(t, resolvedActions, keyboardShortcutBindings),
    [keyboardShortcutBindings, resolvedActions, t]
  )

  useEffect(() => {
    if (!activeMenuId) return
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      // portal 渲染的 popover 不在 rootRef 内，需一并视为内部点击，
      // 否则点击菜单项会先触发外部关闭导致 click 事件丢失。
      if (target instanceof Node && (
        rootRef.current?.contains(target) || popoverRef.current?.contains(target)
      )) return
      setActiveMenuId(null)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setActiveMenuId(null)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [activeMenuId])

  /* Listen for Electron maximize / unmaximize events via the
     resize event to toggle the maximize/restore icon. */
  useEffect(() => {
    if (typeof window === 'undefined') return
    const checkMaximized = (): void => {
      // Heuristic: in Electron, when the window is maximized via `win.maximize()`,
      // screenX/screenY are 0 (or -8 with shadow compensation on Windows)
      // and outerWidth/outerHeight fill the screen.  This is the most
      // reliable cross-platform signal available from the renderer.
      const isMax =
        window.outerWidth >= window.screen.availWidth &&
        window.outerHeight >= window.screen.availHeight
      setIsMaximized(isMax)
    }
    checkMaximized()
    window.addEventListener('resize', checkMaximized)
    return () => window.removeEventListener('resize', checkMaximized)
  }, [])


  const handleMinimize = useCallback((): void => {
    void resolvedActions.runDesktopCommand('minimize')
  }, [resolvedActions])

  const handleToggleMaximize = useCallback((): void => {
    void resolvedActions.runDesktopCommand('toggleMaximize')
  }, [resolvedActions])

  const handleClose = useCallback((): void => {
    void resolvedActions.runDesktopCommand('close')
  }, [resolvedActions])

  if (!supportsDesktopTitleBar(resolvedPlatform)) return null

  const runMenuAction = (item: Exclude<WindowsTitleBarMenuItem, { kind: 'separator' }>): void => {
    setActiveMenuId(null)
    void item.onSelect()
  }

  return (
    <div ref={rootRef} data-cursor-spotlight-target className="ds-windows-titlebar ds-drag">
      <div className="ds-windows-titlebar-content">
        <img src={kunLogo} alt="" aria-hidden="true" className="ds-windows-titlebar-icon" />
        <nav className="ds-windows-menu ds-no-drag" aria-label={t('windowsMenuAriaLabel')}>
          {menus.map((menu) => {
            const open = activeMenuId === menu.id
            return (
              <div key={menu.id} className="ds-windows-menu-slot">
                <button
                  type="button"
                  data-cursor-spotlight-target
                  className={`ds-windows-menu-button ${open ? 'is-open' : ''}`}
                  aria-haspopup="menu"
                  aria-expanded={open}
                  onClick={(event) => {
                    if (open) {
                      setActiveMenuId(null)
                    } else {
                      openMenu(menu.id, event.currentTarget)
                    }
                  }}
                  onMouseEnter={(event) => {
                    if (activeMenuId) openMenu(menu.id, event.currentTarget)
                  }}
                >
                  {menu.label}
                </button>
                {open && menuAnchor && typeof document !== 'undefined' ? createPortal(
                  <div
                    ref={popoverRef}
                    className="ds-windows-menu-popover ds-no-drag"
                    role="menu"
                    aria-label={menu.label}
                    style={{
                      left: menuAnchor.left,
                      top: menuAnchor.bottom + MENU_POPOVER_GAP
                    }}
                  >
                    {menu.items.map((item) => {
                      if (item.kind === 'separator') {
                        return <div key={item.id} className="ds-windows-menu-separator" role="separator" />
                      }
                      return (
                        <button
                          key={item.id}
                          type="button"
                          data-cursor-spotlight-target
                          role="menuitem"
                          className="ds-windows-menu-item"
                          onClick={() => runMenuAction(item)}
                        >
                          <span className="truncate">{item.label}</span>
                          {item.shortcut ? <span className="ds-windows-menu-shortcut">{item.shortcut}</span> : null}
                        </button>
                      )
                    })}
                  </div>,
                  document.body
                ) : null}
              </div>
            )
          })}
        </nav>
      </div>
      <div className="ds-window-controls ds-no-drag">
        <button
          type="button"
          data-cursor-spotlight-target
          className="ds-window-control-btn"
          aria-label={t('windowsMenuMinimize')}
          onClick={handleMinimize}
        >
          <MinimizeIcon />
        </button>
        <button
          type="button"
          data-cursor-spotlight-target
          className="ds-window-control-btn"
          aria-label={t('windowsMenuToggleMaximize')}
          onClick={handleToggleMaximize}
        >
          {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
        </button>
        <button
          type="button"
          data-cursor-spotlight-target
          className="ds-window-control-btn ds-window-control-btn--close"
          aria-label={t('windowsMenuClose')}
          onClick={handleClose}
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  )
}

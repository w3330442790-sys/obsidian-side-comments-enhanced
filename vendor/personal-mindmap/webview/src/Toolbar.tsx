import { useEffect, useRef, useState, type ReactNode } from "react";
import { THEMES } from "../../src/core/theme";
import { rootStructure } from "../../src/core/layout";
import { docLook, docTheme } from "../../src/core/doc";
import { findRange, setDocProp } from "../../src/core/ops";
import { getTopic } from "../../src/core/query";
import type { Structure } from "../../src/core/types";
import type { Actions, ViewPrefs } from "./App";
import { Icon } from "./icons";
import { langIsZh, t } from "./i18n";
import { LookSwitch, StructureIcon, ThemeSwatch } from "./FormatPanel";

function Btn({ icon, label, onClick, disabled, active, title }: { icon: ReactNode; label?: string; onClick: () => void; disabled?: boolean; active?: boolean; title?: string }) {
  return (
    <button className={"wm-tb-btn" + (active ? " wm-active" : "")} onClick={onClick} disabled={disabled} title={title ?? label}>
      {icon}
      {label && <span>{label}</span>}
    </button>
  );
}

function Menu({ icon, label, children, disabled, iconOnly, alignRight }: { icon: ReactNode; label: string; children: (close: () => void) => ReactNode; disabled?: boolean; iconOnly?: boolean; alignRight?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", off, true);
    return () => window.removeEventListener("pointerdown", off, true);
  }, [open]);
  return (
    <div className="wm-menu" ref={ref}>
      <button className={"wm-tb-btn" + (open ? " wm-active" : "")} onClick={() => setOpen((o) => !o)} disabled={disabled} title={label}>
        {icon}
        {!iconOnly && <span>{label}</span>}
        <Icon.chevron />
      </button>
      {open && <div className={"wm-popover" + (alignRight ? " wm-popover-right" : "")}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button className="wm-switch-row" role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <span>{label}</span>
      <span className={"wm-switch" + (on ? " wm-on" : "")} />
    </button>
  );
}

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

const STRUCTS: Structure[] = ["map", "logic", "org", "tree"];

export function Toolbar({ position, actions: a, view, setView, panel, togglePanel, laser, toggleLaser, prefs, setPrefs, openSearch }: { position?:"top"|"bottom"|"left"|"right"; openSearch: () => void; actions: Actions; view: "map" | "outline"; setView: (v: "map" | "outline") => void; panel: boolean; togglePanel: () => void; laser: boolean; toggleLaser: () => void; prefs: ViewPrefs; setPrefs: (p: Partial<ViewPrefs>) => void }) {
  const topics = a.selection.filter((id) => !!getTopic(a.doc, id));
  const summaryRange = a.selection.length === 1 ? findRange(a.doc, a.selection[0]) : null;
  const one = topics.length === 1;
  const ro = a.readOnly;
  const st = rootStructure(a.doc);
  const theme = docTheme(a.doc);
  return (
    <div data-position={position} className={"wm-toolbar"+(position==="left"||position==="right"?" wm-toolbar-vertical":"")}>
      <style>{`.wm-toolbar-vertical{flex-direction:column;align-items:stretch;width:150px;overflow-y:auto;overflow-x:hidden;border-right:1px solid var(--wm-border)}.wm-toolbar-vertical .wm-tb-group{flex-direction:column;align-items:stretch}.wm-toolbar-vertical .wm-tb-sep{height:1px;width:100%;margin:4px 0}.wm-toolbar-vertical .wm-tb-spacer{flex:0}.wm-toolbar-vertical .wm-tb-btn{justify-content:flex-start;width:100%}.wm-toolbar-vertical .wm-popover{margin-left:140px;transform:none}.wm-toolbar-vertical[data-position="right"] .wm-popover{margin-left:-280px}`}</style>
      <div className="wm-tb-group">
        <Btn icon={<Icon.undo />} onClick={a.undo} disabled={!a.canUndo || ro} title={t("undo")} />
        <Btn icon={<Icon.redo />} onClick={a.redo} disabled={!a.canRedo || ro} title={t("redo")} />
      </div>
      <div className="wm-tb-sep" />
      <div className="wm-tb-group">
        <Btn icon={<Icon.topic />} label={t("topic")} onClick={() => a.addTopic("sibling")} disabled={ro || view !== "map"} title={`${t("topic")} (Enter)`} />
        <Btn icon={<Icon.subtopic />} label={t("subtopic")} onClick={() => a.addTopic("child")} disabled={ro || view !== "map"} title={`${t("subtopic")} (Tab)`} />
        <Btn icon={<Icon.relationship />} label={t("relationship")} onClick={a.startLinking} disabled={ro || !one || view !== "map"} />
        <Btn icon={<Icon.summary />} label={t("summary")} onClick={() => a.addRange("summaries")} disabled={ro || !topics.length || view !== "map"} />
        <Btn icon={<Icon.boundary />} label={t("boundary")} onClick={() => a.addRange("boundaries")} disabled={ro || !topics.length || view !== "map"} />
        <Btn icon={<Icon.trash />} onClick={a.remove} disabled={ro || !a.selection.length || (a.selection.length === 1 && a.selection[0] === a.doc.root.id) || view !== "map"} title={`${t("remove")} (Delete)`} />
      </div>
      <Menu icon={<Icon.settings />} label="更多">
        {(close)=><div className="wm-menu-list">{[
          ["lock",a.locked?"解锁编辑":"锁定只读",false],
          ["study",a.studyMode?"退出学习模式":"学习模式",false],
          ["notes",a.showNotes?"收起备注卡片":"展开备注卡片",false],
          ["callouts",a.showCallouts?"隐藏标注":"显示标注",false],
          ["outlineDock","切换大纲面板",false],
          ["markers","标记",ro||!topics.length],
          ["showAll","显示 / 隐藏已隐藏节点",false],
          ["focus","聚焦选中分支",!one],
          ["callout","添加 / 编辑标注",ro||!one],
          ["summaryBranch","概括转分支（继续分点）",ro||summaryRange?.kind!=="summaries"],
          ["calloutColor","标注颜色",ro||!one],
          ["width","节点宽度",ro||!one],
          ["split","按标点拆成子节点",ro||!one],
          ["task","任务复选框",ro||!one],
          ["answer","答案标记 🙈",ro||!one],
          ["deleteOnly","仅删除节点，保留子节点",ro||!topics.length],
        ].map(([command,label,disabled])=><button key={String(command)} disabled={!!disabled} onClick={()=>{a.feature(String(command));close();}}>{label}</button>)}</div>}
      </Menu>
      <div className="wm-tb-spacer" />
      <div className="wm-tb-group">
        <Btn icon={<Icon.search />} onClick={openSearch} disabled={view !== "map"} title={`${t("find")} (${isMac ? "⌘F" : "Ctrl+F"})`} />
        <Btn icon={<Icon.laser />} label={t("laserShort")} onClick={toggleLaser} active={laser} disabled={view !== "map"} title={t("laser")} />
      </div>
      <div className="wm-tb-sep" />
      <div className="wm-tb-group">
        <Menu icon={<Icon.structure />} label={t("structure")} disabled={ro}>
          {(close) => (
            <div className="wm-struct-grid">
              {STRUCTS.map((s) => (
                <button
                  key={s}
                  className={"wm-card" + (s === st ? " wm-active" : "")}
                  onClick={() => {
                    a.apply((d) => setDocProp({ ...d, root: { ...d.root, structure: undefined } }, "structure", s));
                    close();
                  }}
                >
                  <StructureIcon s={s} />
                  <span>{t(`structure.${s}`)}</span>
                </button>
              ))}
            </div>
          )}
        </Menu>
        <Menu icon={<Icon.theme />} label={t("theme")} alignRight>
          {(close)=><div className="wm-settings" style={{maxHeight:"calc(100vh - 100px)",overflowY:"auto"}}>
              <div className="wm-settings-title">{t("look")}</div>
              <div className="wm-settings-look">
                <LookSwitch a={a} />
              </div>
              <div className="wm-settings-title">{t("theme")}</div>
              <div className="wm-theme-grid">
                {THEMES.map((th) => (
                  <button
                    key={th.id}
                    className={"wm-card" + (th.id === theme ? " wm-active" : "")}
                    disabled={ro}
                    onClick={() => {
                      a.apply((d) => setDocProp(d, "theme", th.id));
                      close();
                    }}
                  >
                    <ThemeSwatch id={th.id} dark={a.dark} look={docLook(a.doc)} />
                    <span>{langIsZh() ? th.zh : th.en}</span>
                  </button>
                ))}
              </div>
          </div>}
        </Menu>
        <Menu icon={<Icon.export />} label={t("export")}>
          {(close) => (
            <div className="wm-menu-list">
              {(["png", "svg", "md"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => {
                    close();
                    a.exportAs(f);
                  }}
                >
                  {t(`export.${f}`)}
                </button>
              ))}
            </div>
          )}
        </Menu>
      </div>
      <div className="wm-tb-sep" />
      <div className="wm-tb-group">
        <Menu icon={<Icon.settings />} label={t("settings")} iconOnly alignRight>
          {(close) => (
            <div className="wm-settings" style={{maxHeight:"calc(100vh - 100px)",overflowY:"auto"}}>
              <div className="wm-settings-title">{t("display")}</div>
              <Switch label={t("showBranches")} on={prefs.showBranches} onChange={(on) => setPrefs({ showBranches: on })} />
              <Switch label={t("showRelationships")} on={prefs.showRelationships} onChange={(on) => setPrefs({ showRelationships: on })} />

            </div>
          )}
        </Menu>
        <div className="wm-seg">
          <button className={view === "map" ? "wm-active" : ""} onClick={() => setView("map")} title={t("mapView")}>
            <Icon.map />
          </button>
          <button className={view === "outline" ? "wm-active" : ""} onClick={() => setView("outline")} title={t("outline")}>
            <Icon.outline />
          </button>
        </div>
        <Btn icon={<Icon.panel />} onClick={togglePanel} active={panel} title={t("format")} />
      </div>
    </div>
  );
}

/**
 * Read-only diagnostic: opens the Lautec Import Data grid for one date/team,
 * dumps the grid's column structure, then types a PAX value into row 0 and
 * reads it back — WITHOUT ever clicking Import or Save. The modal is simply
 * abandoned, so nothing reaches Lautec.
 *
 * Usage: npx tsx scripts/probe-lautec-pax.ts [YYYY-MM-DD] [Team name]
 */
import { createPuppeteerLautecUi, getLautecBrowserConfig } from "../src/lib/lautec-browser-adapter.js";

const date = process.argv[2] ?? "2026-08-25";
const teamName = process.argv[3] ?? "Team 1";

const config = await getLautecBrowserConfig();
const ui = await createPuppeteerLautecUi(config);
const page = ui.page as any;

try {
  await ui.login(config.username, config.password);
  await ui.openImport(teamName, date);
  console.log("Import grid open. Inspecting…");

  const structure = await page.evaluate(`(() => {
    const cells = Array.from(document.querySelectorAll('td[data-x][data-y="0"]'));
    const headers = Array.from(document.querySelectorAll("thead td, thead th"))
      .map((el) => ({ x: el.getAttribute("data-x"), text: (el.textContent || "").trim(), cls: el.className }));
    const row0 = cells.map((el) => ({
      x: el.getAttribute("data-x"),
      text: (el.textContent || "").trim(),
      cls: el.className,
    }));
    let columnsConfig = null;
    try {
      const w = window;
      const inst = (w.jspreadsheet && w.jspreadsheet.current)
        || (w.jexcel && w.jexcel.current)
        || null;
      if (inst && inst.options && inst.options.columns) {
        columnsConfig = inst.options.columns.map((c, i) => ({ i, type: c.type, title: c.title, readOnly: c.readOnly, mask: c.mask, decimal: c.decimal }));
      }
    } catch (e) { columnsConfig = "err:" + String(e); }
    return { headers, row0, columnsConfig, colCount: cells.length };
  })()`);
  console.log(JSON.stringify(structure, null, 2));

  // Type a PAX into row 0, column 6, exactly the way the import does.
  const cellSel = 'td[data-x="6"][data-y="0"]';
  const cell = await page.$(cellSel);
  if (!cell) {
    console.log("No cell at data-x=6 data-y=0");
  } else {
    await cell.click({ clickCount: 2 });
    await new Promise((r) => setTimeout(r, 300));
    const editorState = await page.evaluate(`(() => {
      const a = document.activeElement;
      return {
        activeTag: a ? a.tagName : null,
        activeType: a && a.getAttribute ? a.getAttribute("type") : null,
        activeCls: a ? a.className : null,
        editorInputs: Array.from(document.querySelectorAll(".jss_input, .jexcel_input, td input, td textarea")).map((el) => ({ tag: el.tagName, cls: el.className })),
        dropdownOpen: Boolean(document.querySelector(".jdropdown-container")),
      };
    })()`);
    console.log("After double-click on PAX cell:", JSON.stringify(editorState, null, 2));

    if (editorState.dropdownOpen) {
      const options = await page.evaluate(`Array.from(document.querySelectorAll(".jdropdown-item")).slice(0, 30).map((el) => (el.textContent || "").trim())`);
      console.log("PAX is a DROPDOWN. Options:", JSON.stringify(options));
      // Select "3" exactly like selectGridOption does and read the cell back.
      const items = await page.$$(".jdropdown-item");
      let clicked = false;
      for (const item of items) {
        const text = ((await (await item.getProperty("textContent")).jsonValue()) ?? "").toString().trim();
        if (text === "3") { await item.click(); clicked = true; break; }
      }
      await new Promise((r) => setTimeout(r, 500));
      const readback = await page.evaluate(`(() => {
        const el = document.querySelector('td[data-x="6"][data-y="0"]');
        return { text: (el.textContent || "").trim(), cls: el.className };
      })()`);
      console.log("Dropdown select clicked:", clicked, "Readback:", JSON.stringify(readback));
    } else {
      await page.keyboard.type("3");
      await page.keyboard.press("Enter");
      await new Promise((r) => setTimeout(r, 300));
      const readback = await page.evaluate(`(() => {
        const el = document.querySelector('td[data-x="6"][data-y="0"]');
        return { text: (el.textContent || "").trim(), cls: el.className };
      })()`);
      console.log("Readback after typing 3 + Enter:", JSON.stringify(readback));
    }
  }
  console.log("Probe complete. Abandoning modal without importing.");
} finally {
  await ui.close();
}

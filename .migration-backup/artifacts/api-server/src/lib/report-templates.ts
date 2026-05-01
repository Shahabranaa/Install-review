// Field-report template registry. Each template maps to one of the existing
// Drive-mirrored PDF types so manually-created reports can be rendered with
// the same structure and slot into the same Wasabi prefix.

export type FieldType = "text" | "textarea" | "date" | "time" | "number";
export type Scope = "string" | "cable";

export interface HeaderField {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
}

export interface ChecklistItem {
  key: string;
  label: string;
}

export interface DocumentRef {
  name: string;
  number?: string;
}

export interface PhaseColumn {
  key: string;
  label: string;
}

export interface PhaseRow {
  key: string;       // e.g. "L1"
  label: string;     // e.g. "L1 - Red"
}

export interface PhasesSection {
  title: string;     // e.g. "Serial Numbers"
  rows: PhaseRow[];
  columns: PhaseColumn[];
}

export interface NumericField {
  key: string;
  label: string;
  unit?: string;
}

export interface ChecklistGroup {
  title?: string;
  items: ChecklistItem[];
}

export interface ReportTemplate {
  id: string;                       // template id (stable, used by parser)
  label: string;                    // display name
  reportTypeTag: string;            // value matched by parseReportType
  scope: Scope;                     // 'string' = report covers a string; 'cable' = report covers a single cable
  fileNamePattern: (ctx: { stringName: string; cableName?: string | null }) => string;
  documentTitle: string;            // big title on the PDF
  documentRefs?: DocumentRef[];
  header: HeaderField[];
  phases?: PhasesSection;
  checklists: ChecklistGroup[];
  numericFields?: NumericField[];
  imagePlaceholders?: string[];
  hasRemarks?: boolean;
}

// ─────────────────── Template definitions ───────────────────

const PROJECT = "CVOW";

const headerStringScope: HeaderField[] = [
  { key: "project",  label: "Project",  type: "text", defaultValue: PROJECT, required: true },
  { key: "location", label: "Location", type: "text", required: true, placeholder: "e.g. G2H06" },
];

const headerCableScope: HeaderField[] = [
  ...headerStringScope,
  { key: "cable", label: "Cable", type: "text", required: true, placeholder: "e.g. A02-1" },
];

const PULL_IN_REFS: DocumentRef[] = [
  { name: "IAC OSS Pull-In Procedure",  number: "CVOW1-IAC-DMN-PRD-CN-00006" },
  { name: "IAC WTG Pull-In Procedure",  number: "CVOW1-IAC-DMN-PRD-CN-00008" },
  { name: "OEC OSS Pull-In Procedure",  number: "CVOW1-OEC-DMN-PRD-QA-00011" },
];

const HANG_OFF_REFS: DocumentRef[] = [
  { name: "Hang Off Installation Procedure", number: "CVOW1-IAC-DMN-PRD-CD-00002" },
];

export const REPORT_TEMPLATES: ReportTemplate[] = [
  // ── Pull-in Preparation ──
  {
    id: "pull-in-preparation",
    label: "Pull-in Preparation",
    reportTypeTag: "Pull-in Preparation",
    scope: "cable",
    fileNamePattern: ({ stringName, cableName }) => `Pull-in Preparation for ${stringName} -{${cableName}}.pdf`,
    documentTitle: "PULL-IN PREPARATION REPORT",
    documentRefs: PULL_IN_REFS,
    header: [
      ...headerCableScope,
      { key: "hangOffPot",            label: "Hang Off Pot",                      type: "text" },
      { key: "cehNumber",             label: "CEH Number / degrees",              type: "text", placeholder: "e.g. CEH - 2 - Degrees - 0%" },
      { key: "winchSerial",           label: "Winch serial Number",               type: "text" },
      { key: "winchCalExpDate",       label: "Winch Calibration Exp Date",        type: "text" },
      { key: "controlBoxSerial",      label: "Control Box Serial Number",         type: "text" },
      { key: "controlBoxCalExpDate",  label: "Control Box Calibration Exp Date",  type: "text" },
      { key: "date",                  label: "Date",                              type: "date" },
    ],
    checklists: [{
      items: [
        { key: "winchSecured",          label: "Winch secured in place on external platform?" },
        { key: "winchFunctionTest",     label: "Winch Function test completed?" },
        { key: "rollerBoxAnchor",       label: "Roller Box and Flange anchor installed and secured with Nylon gaskets fitted?" },
        { key: "spiderRigging",         label: "Spider rigging installed?" },
        { key: "holdBackRigging",       label: "Hold back rigging installed and secured at Bolting and Equipment platform hatches?" },
        { key: "miniRovTest",           label: "Function test of Mini ROV completed?" },
        { key: "messengerInstalled",    label: "Messenger wire installed?" },
        { key: "imagesCaptured",        label: "All images/recordings captured?" },
      ],
    }],
    imagePlaceholders: [
      "Image showing Hang Off ID",
      "Image of messenger wire arrangement connected to the messenger wire",
      "Image showing card in front of ROV indicating the items shown",
      "Image of messenger hook engaged to CEH and taught",
      "Messenger wire secured in place with Hang off Lid",
      "Image showing messenger secured",
      "As found image of bolting flange where Roller Box is installed",
      "As found image of bolting flange where Anchor Point is installed",
      "As Left image of Roller Box installed",
      "As Left image of Roller Box installed (Bolts secured on underside of flange)",
      "As left image of Anchor Point installed",
      "As left image of Anchor Point installed (bolts secured on underside of flange)",
      "As-left image Equipment platform including CMS and Rigging",
      "As-left image Airtight Platform of CMS and Rigging",
      "Final As left image of Bolting Platform including Spider Rigging",
      "Image showing winch secured to the platform with bolts",
      "Final As left image of External Platform showing winch and TP Cover",
    ],
    hasRemarks: true,
  },

  // ── Cable Pull-in ──
  {
    id: "cable-pull-in",
    label: "Cable Pull-in",
    reportTypeTag: "Cable Pull-in",
    scope: "cable",
    fileNamePattern: ({ stringName, cableName }) => `Cable Pull-in for ${stringName} -{${cableName}}.pdf`,
    documentTitle: "Cable Pull-IN REPORT",
    documentRefs: PULL_IN_REFS,
    header: [
      ...headerCableScope,
      { key: "hangOffPot",   label: "Hang Off Pot",         type: "text" },
      { key: "cehNumber",    label: "CEH Number / degrees", type: "text" },
      { key: "date",         label: "Date",                 type: "date" },
    ],
    checklists: [{
      items: [
        { key: "winchFunctionTest",      label: "Winch Function test completed" },
        { key: "equipmentInspected",     label: "Pull-in equipment and accessories inspected" },
        { key: "equipmentSetup",         label: "Pull-In equipment setup as per procedure" },
        { key: "messengerInstalled",     label: "Messenger wire installed correctly" },
        { key: "asLeftSecured",          label: "As Left Cable secured with Hold back rigging on airtight platform" },
      ],
    }],
    numericFields: [
      { key: "pullInStart",        label: "Pull-In Start time" },
      { key: "latchingLoad",       label: "Latching Load Recorded", unit: "te" },
      { key: "weakLinkBreaking",   label: "Weak link Breaking Load recorded", unit: "te" },
      { key: "maxTension",         label: "Max tension recorded during Pull-In", unit: "te" },
      { key: "pullInFinish",       label: "Pull-In finish time" },
      { key: "overpullMeasurement",label: "Cable over-pull measurement", unit: "m" },
    ],
    hasRemarks: true,
  },

  // ── Temporary Hang-Off ──
  {
    id: "temporary-hang-off",
    label: "Temporary Hang Off Installation",
    reportTypeTag: "Temporary Hang Off",
    scope: "cable",
    fileNamePattern: ({ stringName, cableName }) => `Temporary Hang Off Installation for ${stringName} -{${cableName}}.pdf`,
    documentTitle: "TEMPORARY HANG-OFF FIELD REPORT",
    documentRefs: HANG_OFF_REFS,
    header: [
      ...headerCableScope,
      { key: "date", label: "Date", type: "date" },
    ],
    checklists: [{
      items: [
        { key: "mastic",         label: "Mastic Installed Around Temporary Hang Off?" },
        { key: "armourWires",    label: "Armour wires of temporary hang-off positioned, cleaned and crimped?" },
        { key: "resinPoured",    label: "Resin Poured in Temporary Hang Off?" },
        { key: "hangOffCleaned", label: "Hang Off Cleaned?" },
        { key: "slippageMark",   label: "200mm Slippage Mark Applied?" },
      ],
    }],
    imagePlaceholders: [
      "Show outer layer of cable removed and resin retaining plate fitted with armours clean",
      "Image showing 150mm measurement of flange to plate seams",
      "Show retaining plate installed in I-tube with Mastic applied",
      "Show Temporary hang off top plates installed with armour wires crimped to support cable",
      "Show torque marks applied to nuts after torquing",
      "Show Resin has been applied and is level with the top plate",
      "Show slippage control mark applied with tape exactly 200mm above the face of the top plate",
      "Final overview image of completed Temporary Hang off",
    ],
  },

  // ── Permanent Hang-Off ──
  {
    id: "permanent-hang-off",
    label: "Permanent Hang Off Installation",
    reportTypeTag: "Permanent Hang Off",
    scope: "cable",
    fileNamePattern: ({ stringName, cableName }) => `Permanent Hang Off Installation for ${stringName} -{${cableName}}.pdf`,
    documentTitle: "PERMANENT HANG-OFF FIELD REPORT",
    documentRefs: HANG_OFF_REFS,
    header: [
      ...headerCableScope,
      { key: "date", label: "Date", type: "date" },
    ],
    checklists: [{
      items: [
        { key: "coresPrepped",   label: "Cores prepped for resin with mastic/tape applied" },
        { key: "earthCables",    label: "Earth cables installed?" },
        { key: "boltsTorqued",   label: "All bolts torqued and torque marks applied?" },
        { key: "resinPoured",    label: "Resin poured?" },
        { key: "overviewImage",  label: "Complete hang-off overview captured with Hang-Off ID?" },
      ],
    }],
    imagePlaceholders: [
      "Show small (10-15mm diameter) piece of mastic applied between the 3 cores",
      "Show mastic applied and cores prepared for resin",
      "Show clamping plates installed with armour wires in final position",
      "Show Armour Clamping plates installed, and torque marks applied",
      "Overview of hang off with Collar installed and all Mastic/Tape applied",
      "Image of resin pour",
      "Overview of hang-off and earth connections",
    ],
  },

  // ── Termination Activities (single-phase reports L1/L2/L3) ──
  ...(["L1", "L2", "L3"] as const).map<ReportTemplate>(phase => ({
    id: `termination-activities-${phase.toLowerCase()}`,
    label: `Termination Activities - ${phase}`,
    reportTypeTag: "FO Termination",
    scope: "cable",
    fileNamePattern: ({ stringName, cableName }) => `Termination Activities - ${phase} for ${stringName} -{${cableName}}.pdf`,
    documentTitle: "NKT HV TERMINATION FIELD REPORT",
    header: [
      ...headerCableScope,
      { key: "rdsppNumber",   label: "RDSPP Number",   type: "text" },
      { key: "cableSupplier", label: "Cable Supplier", type: "text", defaultValue: "PRYS 630" },
      { key: "date",          label: "Date",           type: "date" },
    ],
    phases: {
      title: "Serial Numbers",
      rows: [{ key: phase, label: `${phase} - ${phase === "L1" ? "Red" : phase === "L2" ? "Yellow" : "Blue"}` }],
      columns: [
        { key: "tBoot",            label: "T Boot" },
        { key: "stressCone",       label: "Stress Cone" },
        { key: "insulatingPlugs",  label: "Insulating Plugs" },
        { key: "aluFoilEarthKit",  label: "Alu Foil Earth Kit" },
      ],
    },
    checklists: [{ items: [] }],
    imagePlaceholders: [
      `Alu-foil Window cut and cleaned with tape applied - ${phase}`,
      `Alu-foil earth clamps installed and tightened to 50%. Show guide pin installed as a reference. - ${phase}`,
      `Alu-foil earth installed, and tapes applied - ${phase}`,
      `Semi-conducting tape applied with 50% overlap - ${phase}`,
      `Alu-foil earth complete with Heat Shrink applied - ${phase}`,
      `Image with ruler showing measurement from screen wires to the tip of the core – Ensure measurement can be read - ${phase}`,
      `Close up image of the stepless transition - ${phase}`,
      `Once Cleaned, Image should illustrate: Correct landing of the stress cone, Installation of Lug, and cleaned termination - ${phase}`,
      `Show control mark measurement (approx. 20mm) - ${phase}`,
      `Insulation Plug installed for each phase - ${phase}`,
      `Close up image of each phase earthing secured - ${phase}`,
      `Label installed for each termination - ${phase}`,
    ],
  })),

  // ── Termination Completion ──
  {
    id: "termination-completion",
    label: "Termination Completion",
    reportTypeTag: "Termination Completion",
    scope: "cable",
    fileNamePattern: ({ stringName, cableName }) => `Termination Completion for ${stringName} -{${cableName}}.pdf`,
    documentTitle: "NKT HV TERMINATION FIELD REPORT",
    header: [
      ...headerCableScope,
      { key: "rdsppNumber",   label: "RDSPP Number",   type: "text" },
      { key: "cableSupplier", label: "Cable Supplier", type: "text", defaultValue: "PRYS 630" },
      { key: "date",          label: "Date",           type: "date" },
    ],
    phases: {
      title: "Serial Numbers",
      rows: [
        { key: "L1", label: "L1 - Red" },
        { key: "L2", label: "L2 - Yellow" },
        { key: "L3", label: "L3 - Blue" },
      ],
      columns: [
        { key: "tBoot",            label: "T Boot" },
        { key: "stressCone",       label: "Stress Cone" },
        { key: "insulatingPlugs",  label: "Insulating Plugs" },
        { key: "aluFoilEarthKit",  label: "Alu Foil Earth Kit" },
      ],
    },
    checklists: [{
      items: [
        { key: "cableRouted",       label: "Cable fully routed and cleated as per 111274-SP-001" },
        { key: "mbrNotCompromised", label: "MBR not compromised during installation" },
        { key: "phaseSequence",     label: "Phase correct and connected in the correct sequence" },
        { key: "phaseTape",         label: "Phase tape applied" },
        { key: "coresTerminated",   label: "All cores terminated as per 111274-SP-002" },
        { key: "studTorque",        label: "Termination stud torqued to 45Nm" },
        { key: "nutTorque",         label: "Termination nut and washer torqued to 70Nm" },
        { key: "plugTorque",        label: "Insulating plug torqued to 30Nm" },
        { key: "earthTorque",       label: "Earth bar connections torqued to 70Nm" },
        { key: "imagesRecorded",    label: "All required images recorded" },
      ],
    }],
    hasRemarks: true,
  },

  // ── FO Termination ──
  {
    id: "fo-termination",
    label: "FO Termination Activities",
    reportTypeTag: "FO Termination",
    scope: "string",
    fileNamePattern: ({ stringName }) => `FO Termination Activities for ${stringName}.pdf`,
    documentTitle: "FO TERMINATION REPORT",
    header: [
      ...headerStringScope,
      { key: "cableNumbers", label: "Cable Numbers", type: "text", placeholder: "e.g. A02-1, A02-2" },
      { key: "foBoxId",      label: "FO Box ID",     type: "text" },
      { key: "date",         label: "Date",          type: "date" },
    ],
    checklists: [{
      items: [
        { key: "cableRouted",      label: "Cable fully routed and cleated as per 111274-SP-001" },
        { key: "serviceLoop",      label: "Minimum of 1 service loop installed and positioned 2.4 m inside FO Box" },
        { key: "minBendRadius",    label: "Minimum bend radius achieved for service loop" },
        { key: "foGlands",         label: "FO glands installed correctly" },
        { key: "earthArrangement", label: "Earth arrangement complete and correct" },
        { key: "fibresTerminated", label: "Fibres terminated per splice plans and as per 111274-SP-004" },
        { key: "splicesNumbered",  label: "All splice trays numbered" },
        { key: "imagesRecorded",   label: "All required images recorded" },
      ],
    }],
    imagePlaceholders: [
      "FO Cable gland installed in FO Box – Olive glands installed and earthed",
      "Image of Gland components assembled on cable #1 prior to connection",
      "Image of Gland components assembled on cable #2 prior to connection",
      "Image showing cable management inside the FO Box",
      "Splice Tray 1 labelled",
      "Splice Tray 2 labelled",
      "Splice Tray 3 labelled",
      "Splice Tray 4 labelled",
      "Splice Tray 5 labelled",
      "Splice Tray 6 labelled",
      "Splice Tray 7 labelled",
      "Splice Tray 8 labelled",
      "Internal overview image of completed installation",
      "Pig tails terminated and installed in Patch Panel",
      "Image of Service loop installed",
      "Label for incoming FO Cable",
      "Label for outgoing FO cable",
      "Label installed on each fibre cable below gland – ensure labels can be read.",
      "A5 Splice Plan installed on FO Box door",
      "Overview of FO Box with warning labels fitted",
    ],
  },

  // ── ICCP ──
  {
    id: "iccp",
    label: "ICCP",
    reportTypeTag: "ICCP",
    scope: "string",
    fileNamePattern: ({ stringName }) => `ICCP for ${stringName}.pdf`,
    documentTitle: "Offshore installation check list — Internal anodes and RC's",
    header: [
      { key: "customer",        label: "Customer",         type: "text", defaultValue: "CS WIND / Bladt" },
      { key: "project",         label: "Project",          type: "text", defaultValue: "Coastal Virginia Offshore Wind" },
      { key: "corrRef",         label: "CORR.ref.",        type: "text", defaultValue: "15864" },
      { key: "tpId",            label: "TP ID",            type: "text", required: true },
      { key: "tpRef",           label: "TP ref.",          type: "text" },
      { key: "installedBy",     label: "Installed by",     type: "text" },
      { key: "company",         label: "Company",          type: "text", defaultValue: "JDR" },
      { key: "checkBy",         label: "Check by",         type: "text" },
      { key: "date",            label: "Date",             type: "date" },
    ],
    checklists: [
      {
        title: "1. Pre-installation check",
        items: [
          { key: "preA", label: "Sealing removed" },
          { key: "preB", label: "No visible damage on anodes" },
          { key: "preC", label: "No visible damage on RC" },
          { key: "preD", label: "No visible damage on cables" },
        ],
      },
      {
        title: "2. Internal anode installation",
        items: [
          { key: "anodeA", label: "Cables unrolled and untangled" },
          { key: "anodeB", label: "All anodes lowered into void" },
          { key: "anodeC", label: "All grips hooked up in the flange" },
          { key: "anodeD", label: "No cables between flange and flange lid" },
          { key: "anodeE", label: "Roxtec secured" },
          { key: "anodeF", label: "Close flange and tighten bolts" },
        ],
      },
      {
        title: "3. Internal reference cell installation",
        items: [
          { key: "rcA", label: "Cables unrolled and untangled" },
          { key: "rcB", label: "All RC's lowered into void" },
          { key: "rcC", label: "All RC's hooked up in the flange" },
          { key: "rcD", label: "No cables between flange and flange lid" },
          { key: "rcE", label: "Roxtec closed" },
          { key: "rcF", label: "Close flange and tighten bolts" },
        ],
      },
      {
        title: "4. Checkpoints",
        items: [
          { key: "chkA", label: "Anodes well suspended" },
          { key: "chkB", label: "RC's well suspended" },
          { key: "chkC", label: "Cable routing correct" },
          { key: "chkD", label: "Junction box closed and secured" },
          { key: "chkE", label: "Tighten cable glands" },
          { key: "chkF", label: "Flanges closed, secured and grounded." },
        ],
      },
    ],
    hasRemarks: true,
  },

  // ── Completion Check Report ──
  {
    id: "completion-check",
    label: "Completion Check Report",
    reportTypeTag: "Completion Check",
    scope: "string",
    fileNamePattern: ({ stringName }) => `Completion Check Report for ${stringName}.pdf`,
    documentTitle: "Walkdown Document — Completion Check Report",
    header: [
      { key: "projectName",      label: "Project Name",      type: "text", defaultValue: "CVOW" },
      { key: "client",           label: "Client",            type: "text", defaultValue: "DEME" },
      { key: "jobReference",     label: "Job Reference #",   type: "text", defaultValue: "107931" },
      { key: "documentNumber",   label: "Document #",        type: "text", defaultValue: "107931-FR-008" },
      { key: "location",         label: "Location",          type: "text", required: true },
      { key: "cables",           label: "Cable(s)",          type: "text", placeholder: "e.g. A02-1, A02-2" },
      { key: "responsiblePerson",label: "Responsible Person(s)", type: "text" },
      { key: "date",             label: "Date",              type: "date" },
    ],
    checklists: [
      {
        title: "General",
        items: [
          { key: "trefoilCleats",   label: "Trefoil cleats installed and correctly positioned" },
          { key: "singleCleats",    label: "Single cleats installed and correctly positioned" },
          { key: "cableMgmtSystem", label: "Cable management system reinstated" },
          { key: "earthingSystem",  label: "EARTHING SYSTEM (earth bars positioned, correct sized cables, all cables secured, torque markings)" },
          { key: "skotchkote",      label: "Skotchkote applied where required" },
          { key: "routingOverview", label: "Routing overview images captured" },
          { key: "glandsCorrect",   label: "Glands installed correctly" },
        ],
      },
      {
        title: "Hang Off Checklist",
        items: [
          { key: "hangOffEarthing",  label: "Hang off earthing cables installed/secured and visually inspected" },
          { key: "earthConnections", label: "Earth connections checked and Skotchkote applied" },
          { key: "torqueValues",     label: "Torque values correct and marked" },
          { key: "resinPoured",      label: "Resin poured (where required)" },
        ],
      },
      {
        title: "Fiber Checklist",
        items: [
          { key: "foCableMbr",       label: "FO cable MBR OK" },
          { key: "foBoxInstalled",   label: "Fibre optic wall box/enclosure installed correctly" },
          { key: "extMaintLoop",     label: "External maintenance loop of fibre secured and visually inspected" },
          { key: "rdsppLabels",      label: "RDSPP labels installed for fibre optic cable" },
          { key: "patchPorts",       label: "Patch ports numbered" },
          { key: "splicePlan",       label: "Splice plan installed inside the FO box" },
          { key: "warningLabels",    label: "Warning labels fitted to FO box" },
          { key: "powerCoreEarthed", label: "Power core metallic screens, T-connector drains earthed (Ali-foil braids earthed where applicable)" },
        ],
      },
    ],
    hasRemarks: true,
  },

  // ── As-Found Inspection ──
  {
    id: "as-found",
    label: "As-Found Inspection",
    reportTypeTag: "As-Found",
    scope: "string",
    fileNamePattern: ({ stringName }) => `As-Found Inspection for ${stringName}.pdf`,
    documentTitle: "WTG TP In Survey Document",
    header: [
      { key: "attendees",  label: "Attendees (Name / Position / Company)", type: "textarea" },
      { key: "date",       label: "Date",       type: "date" },
      { key: "timeFrom",   label: "Time from",  type: "time" },
      { key: "timeSigned", label: "Time signed",type: "time" },
      { key: "section",    label: "Section",    type: "text" },
      { key: "tpId",       label: "TP ID",      type: "text", required: true },
    ],
    checklists: [{
      title: "Initial Checks",
      items: [
        { key: "gates",         label: "Gates functioning correctly?" },
        { key: "birdGuano",     label: "Any hindering amounts of bird guano present?" },
        { key: "tentCover",     label: "TP tent cover in place – check for issues such as condition or excess puddled water" },
        { key: "doorIssues",    label: "Any TP door issues?" },
        { key: "waterIngress",  label: "Any ingress of water found?" },
        { key: "correctEquip",  label: "Correct equipment in place for SOW (CMS, PHO, Accessories)?" },
        { key: "hangOffIds",    label: "Hang-Off IDs show correct orientation" },
        { key: "gisInspection", label: "Inspection of GIS – seal bag condition, humidity indicators, shock indicators" },
        { key: "otherIssues",   label: "Any other issues?" },
      ],
    }],
    hasRemarks: true,
  },

  // ── As-Left Inspection ──
  {
    id: "as-left",
    label: "As-Left Inspection",
    reportTypeTag: "As-Left",
    scope: "string",
    fileNamePattern: ({ stringName }) => `As-Left Inspection for ${stringName}.pdf`,
    documentTitle: "WTG TP Out Survey Document",
    header: [
      { key: "attendees",  label: "Attendees (Name / Position / Company)", type: "textarea" },
      { key: "date",       label: "Date",       type: "date" },
      { key: "timeFrom",   label: "Time from",  type: "time" },
      { key: "timeSigned", label: "Time signed",type: "time" },
      { key: "section",    label: "Section",    type: "text" },
      { key: "tpId",       label: "TP ID",      type: "text", required: true },
    ],
    checklists: [{
      title: "General Location Overview — Defect Counts",
      items: [
        { key: "extPlatform",      label: "External Platform Defects Recorded" },
        { key: "boltingPlatform",  label: "Bolting Platform Defects Recorded" },
        { key: "switchgearPlatform",label:"Switchgear Platform Defects Recorded" },
        { key: "equipPlatform",    label: "Equipment Platform Defects Recorded" },
        { key: "airtightPlatform", label: "Airtight Platform and Hang-offs Defects Recorded" },
      ],
    }],
    hasRemarks: true,
  },
];

export const TEMPLATE_BY_ID: Record<string, ReportTemplate> = Object.fromEntries(
  REPORT_TEMPLATES.map(t => [t.id, t]),
);

export function getTemplate(id: string): ReportTemplate | undefined {
  return TEMPLATE_BY_ID[id];
}

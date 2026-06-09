/**
 * 24/12 Hour Electricity Tariff Clock Widget Logic
 * Features:
 * - Dynamic SVG arc calculation for 24h & 12h AM/PM concentric rings.
 * - Complex tariff calendar evaluation (offDays priority -> season -> dayType -> time range).
 * - Real-time simulation and preset testing.
 * - Verified JSON configuration editor saved in localStorage.
 * - Dynamic color customizers and smooth sweeps.
 */

// ==========================================================================
// 1. Safe LocalStorage Wrapper (Prevents iOS WebView SecurityError crashes)
// ==========================================================================
const safeStorage = {
  getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn("Storage read blocked: ", e.message);
      return null;
    }
  },
  setItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn("Storage write blocked: ", e.message);
    }
  },
  removeItem(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn("Storage remove blocked: ", e.message);
    }
  }
};

const DEFAULT_TARIFF_SCHEDULE = {
  "notes": [
    "Summer season is 06-01 to 09-30.",
    "Non-summer season is 01-01 to 05-31 and 10-01 to 12-31.",
    "offDays have priority and are off-peak all day.",
    "days supports weekday, saturday, sunday, and offDay."
  ],
  "defaultPeriod": "off-peak",
  "periods": {
    "peak": {
      "label": "Peak",
      "bodyClass": "peak"
    },
    "semi-peak": {
      "label": "Semi-peak",
      "bodyClass": "semi-peak"
    },
    "off-peak": {
      "label": "Off-peak",
      "bodyClass": "off-peak"
    }
  },
  "offDays": {
    "2026": ["05-01", "06-19", "09-25", "09-28", "10-10", "12-25"]
  },
  "seasons": [
    {
      "id": "summer",
      "label": "Summer",
      "start": "06-01",
      "end": "09-30",
      "rules": [
        { "days": ["weekday"], "from": "00:00", "to": "09:00", "period": "off-peak" },
        { "days": ["weekday"], "from": "09:00", "to": "16:00", "period": "semi-peak" },
        { "days": ["weekday"], "from": "16:00", "to": "22:00", "period": "peak" },
        { "days": ["weekday"], "from": "22:00", "to": "24:00", "period": "semi-peak" },
        { "days": ["saturday", "sunday", "offDay"], "from": "00:00", "to": "24:00", "period": "off-peak" }
      ]
    },
    {
      "id": "nonSummerEarly",
      "label": "Non-summer",
      "start": "01-01",
      "end": "05-31",
      "rules": [
        { "days": ["weekday"], "from": "00:00", "to": "06:00", "period": "off-peak" },
        { "days": ["weekday"], "from": "06:00", "to": "11:00", "period": "semi-peak" },
        { "days": ["weekday"], "from": "11:00", "to": "14:00", "period": "off-peak" },
        { "days": ["weekday"], "from": "14:00", "to": "24:00", "period": "semi-peak" },
        { "days": ["saturday", "sunday", "offDay"], "from": "00:00", "to": "24:00", "period": "off-peak" }
      ]
    },
    {
      "id": "nonSummerLate",
      "label": "Non-summer",
      "start": "10-01",
      "end": "12-31",
      "rules": [
        { "days": ["weekday"], "from": "00:00", "to": "06:00", "period": "off-peak" },
        { "days": ["weekday"], "from": "06:00", "to": "11:00", "period": "semi-peak" },
        { "days": ["weekday"], "from": "11:00", "to": "14:00", "period": "off-peak" },
        { "days": ["weekday"], "from": "14:00", "to": "24:00", "period": "semi-peak" },
        { "days": ["saturday", "sunday", "offDay"], "from": "00:00", "to": "24:00", "period": "off-peak" }
      ]
    }
  ]
};

let activeConfig = JSON.parse(JSON.stringify(DEFAULT_TARIFF_SCHEDULE));

// Custom Colors state
let customColors = {
  peak: "#ef4444",
  "semi-peak": "#f59e0b",
  "off-peak": "#10b981"
};

// Application State
let state = {
  isSimulating: false,
  simulatedDate: "", // YYYY-MM-DD
  simulatedTime: 720, // minutes (0 - 1439)
  timeFormat: "24h", // '12h' or '24h'
  secondHandMode: "smooth", // 'smooth' or 'step'
  theme: "dark"
};

// ==========================================================================
// 2. DOM Elements Selection
// ==========================================================================
const widgetCard = document.getElementById("tariff-widget");
const widgetSeasonLabel = document.getElementById("widget-season-label");
const widgetTimeFormatBadge = document.getElementById("widget-time-format-badge");
const widgetDigitalTime = document.getElementById("widget-digital-time");
const widgetDate = document.getElementById("widget-date");
const tariffBadge = document.getElementById("tariff-badge");
const tariffLabel = document.getElementById("tariff-label");
const clockAmPmLabel = document.getElementById("clock-am-pm");

// Clock hands
const hourHand = document.getElementById("hour-hand");
const minuteHand = document.getElementById("minute-hand");
const secondHand = document.getElementById("second-hand");
const secondHandGroup = document.getElementById("second-hand-group");

// SVG groups
const tariffSectorsGroup = document.getElementById("tariff-sectors");
const clockTicksGroup = document.getElementById("clock-ticks");
const clockLabelsGroup = document.getElementById("clock-labels");

// Simulation elements
const simDateInput = document.getElementById("sim-date");
const simTimeSlider = document.getElementById("sim-time-slider");
const simTimeDisplay = document.getElementById("sim-time-display");
const resetTimeBtn = document.getElementById("reset-time-btn");
const presetButtons = document.querySelectorAll(".preset-btn");

// Control settings elements
const timeFormatSwitch = document.getElementById("time-format-switch");
const themeSwitch = document.getElementById("theme-switch");
const secondHandSwitch = document.getElementById("second-hand-switch");
const widgetModeBtn = document.getElementById("widget-mode-btn");
const widgyModeBtn = document.getElementById("widgy-mode-btn");
const exitWidgetModeBtn = document.getElementById("exit-widget-mode-btn");
const widgetFormatToggleBtn = document.getElementById("widget-format-toggle-btn");

// Color Pickers
const colorPeak = document.getElementById("color-peak");
const colorSemiPeak = document.getElementById("color-semi-peak");
const colorOffPeak = document.getElementById("color-off-peak");

// JSON Editor Elements
const jsonEditor = document.getElementById("json-editor");
const saveJsonBtn = document.getElementById("save-json-btn");
const resetJsonBtn = document.getElementById("reset-json-btn");
const jsonErrorMsg = document.getElementById("json-error-msg");

// ==========================================================================
// 3. Tariff Calendar Logic Engine
// ==========================================================================

/**
 * Checks if a string date "MM-DD" falls within a range [start, end].
 * Handles wrapping ranges if start > end (e.g. crossing calendar years).
 */
function isMMDDInRange(dateStr, start, end) {
  if (start <= end) {
    return dateStr >= start && dateStr <= end;
  } else {
    // Crosses year boundary (e.g., Dec 1st to Feb 28th)
    return dateStr >= start || dateStr <= end;
  }
}

/**
 * Classifies the type of day for rule evaluation: 'offDay', 'sunday', 'saturday', or 'weekday'
 */
function getDayType(date, config) {
  const yearStr = date.getFullYear().toString();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const mmdd = `${month}-${day}`;

  // Priority 1: Check if date is in offDays list
  if (config.offDays && config.offDays[yearStr]) {
    if (config.offDays[yearStr].includes(mmdd)) {
      return "offDay";
    }
  }

  // Priority 2: Check days of week
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0) return "sunday";
  if (dayOfWeek === 6) return "saturday";

  return "weekday";
}

/**
 * Finds the season match for a given MM-DD date string.
 */
function getActiveSeason(date, config) {
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const mmdd = `${month}-${day}`;

  for (const season of config.seasons) {
    if (isMMDDInRange(mmdd, season.start, season.end)) {
      return season;
    }
  }
  return null;
}

/**
 * Evaluates the electricity tariff period for a specific Date object.
 */
function getTariffForDateTime(date, config) {
  const dayType = getDayType(date, config);
  const season = getActiveSeason(date, config);
  
  if (!season) {
    return config.defaultPeriod || "off-peak";
  }

  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const timeStr = `${hours}:${minutes}`;

  // Evaluate rules in order
  for (const rule of season.rules) {
    if (rule.days.includes(dayType)) {
      // time in range [from, to)
      // handling "24:00" mapping
      const toTime = rule.to === "24:00" ? "24:00" : rule.to;
      if (timeStr >= rule.from && timeStr < toTime) {
        return rule.period;
      }
    }
  }

  return config.defaultPeriod || "off-peak";
}

/**
 * Generates an array of tariff periods for all 1440 minutes of a given date.
 */
function getDayTariffTimeline(baseDate, config) {
  const timeline = [];
  const testDate = new Date(baseDate);
  testDate.setSeconds(0);
  testDate.setMilliseconds(0);

  for (let m = 0; m < 1440; m++) {
    const hours = Math.floor(m / 60);
    const minutes = m % 60;
    testDate.setHours(hours);
    testDate.setMinutes(minutes);

    const period = getTariffForDateTime(testDate, config);
    timeline.push(period);
  }
  return timeline;
}

/**
 * Compresses a minute-by-minute timeline into consolidated segments for drawing SVG arcs.
 */
function getConsolidatedSegments(timeline) {
  const segments = [];
  if (timeline.length === 0) return segments;

  let currentPeriod = timeline[0];
  let startMin = 0;

  for (let m = 1; m < timeline.length; m++) {
    if (timeline[m] !== currentPeriod) {
      segments.push({
        startMin: startMin,
        endMin: m,
        period: currentPeriod
      });
      startMin = m;
      currentPeriod = timeline[m];
    }
  }

  // push last segment
  segments.push({
    startMin: startMin,
    endMin: timeline.length,
    period: currentPeriod
  });

  return segments;
}

// ==========================================================================
// 4. SVG Math & Arc Calculation
// ==========================================================================

/**
 * Helper to convert polar coordinates to Cartesian coordinate mapping.
 * Rotates -90 deg so that 0 / 24 hours starts at the exact top (12 o'clock position).
 */
function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
  const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
  return {
    x: centerX + (radius * Math.cos(angleInRadians)),
    y: centerY + (radius * Math.sin(angleInRadians))
  };
}

/**
 * Generates an SVG path data string for a circle arc.
 */
function describeArc(x, y, radius, startAngle, endAngle) {
  // If a segment covers almost 360 degrees, clip slightly so start and end do not overlap exactly
  if (endAngle - startAngle >= 360) {
    endAngle = startAngle + 359.999;
  }

  const start = polarToCartesian(x, y, radius, startAngle);
  const end = polarToCartesian(x, y, radius, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return [
    "M", start.x, start.y,
    "A", radius, radius, 0, largeArcFlag, 1, end.x, end.y
  ].join(" ");
}

// ==========================================================================
// 5. Rendering & UI Updates
// ==========================================================================

/**
 * Creates dynamic ticks and labels around the clock dial.
 */
function generateClockDial() {
  clockTicksGroup.innerHTML = "";
  clockLabelsGroup.innerHTML = "";
  
  const is24h = state.timeFormat === "24h";
  const numTicks = is24h ? 24 : 12;
  const angleDelta = 360 / numTicks;

  // Render Hour Ticks
  for (let i = 0; i < numTicks; i++) {
    const angle = i * angleDelta;
    const isMajor = is24h ? (i % 2 === 0) : true;
    const tickLength = isMajor ? 6 : 3.5;
    
    // Ticks coordinates
    const outerRadius = 74; // Inside the ring
    const innerRadius = outerRadius - tickLength;
    
    const pOuter = polarToCartesian(100, 100, outerRadius, angle);
    const pInner = polarToCartesian(100, 100, innerRadius, angle);

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", pOuter.x);
    line.setAttribute("y1", pOuter.y);
    line.setAttribute("x2", pInner.x);
    line.setAttribute("y2", pInner.y);
    line.setAttribute("class", `clock-tick ${isMajor ? 'major' : 'minor'}`);
    clockTicksGroup.appendChild(line);

    // Render minor ticks for minutes in 12-hour mode
    if (!is24h) {
      for (let m = 1; m < 5; m++) {
        const subAngle = angle + (m * 6);
        const pOuterSub = polarToCartesian(100, 100, outerRadius, subAngle);
        const pInnerSub = polarToCartesian(100, 100, outerRadius - 2, subAngle);
        
        const subLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
        subLine.setAttribute("x1", pOuterSub.x);
        subLine.setAttribute("y1", pOuterSub.y);
        subLine.setAttribute("x2", pInnerSub.x);
        subLine.setAttribute("y2", pInnerSub.y);
        subLine.setAttribute("class", "clock-tick minor");
        clockTicksGroup.appendChild(subLine);
      }
    }
  }

  // Render Clock Numbers
  const labelRadius = 62;
  const numbersToDraw = is24h ? [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22] : [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const totalSlots = is24h ? 24 : 12;

  numbersToDraw.forEach(num => {
    // Map value to slot index
    const slot = is24h ? num : (num === 12 ? 0 : num);
    const angle = slot * (360 / totalSlots);
    const pos = polarToCartesian(100, 100, labelRadius, angle);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", pos.x);
    text.setAttribute("y", pos.y);
    text.setAttribute("dominant-baseline", "middle");
    text.setAttribute("text-anchor", "middle");
    text.textContent = num;
    clockLabelsGroup.appendChild(text);
  });
}

/**
 * Draws the SVG tariff color rings based on current timeline configuration.
 */
function drawTariffRings(baseDate) {
  tariffSectorsGroup.innerHTML = "";
  const timeline = getDayTariffTimeline(baseDate, activeConfig);
  const segments = getConsolidatedSegments(timeline);

  if (state.timeFormat === "24h") {
    // 24 Hour Single Ring
    // Ring radius: 83, stroke width: 8
    segments.forEach(seg => {
      // 1440 mins = 360 deg -> 1 min = 0.25 deg
      const startAngle = seg.startMin * 0.25;
      // Add tiny 0.1 degree overlap to prevent antialiasing gap at seams
      const endAngle = seg.endMin * 0.25 + 0.1;
      const pathData = describeArc(100, 100, 83, startAngle, endAngle);

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathData);
      path.setAttribute("class", `tariff-arc ${seg.period}`);
      path.setAttribute("stroke-width", "8");
      
      // Dynamic color glow filters
      if (seg.period === "peak") path.setAttribute("filter", "url(#glow-red)");
      if (seg.period === "semi-peak") path.setAttribute("filter", "url(#glow-yellow)");
      if (seg.period === "off-peak") path.setAttribute("filter", "url(#glow-green)");

      tariffSectorsGroup.appendChild(path);
    });
  } else {
    // 12 Hour Concentric Rings (Inner = AM, Outer = PM)
    const amSegments = [];
    const pmSegments = [];

    // Slice segments into AM (0-720 min) and PM (720-1440 min)
    segments.forEach(seg => {
      // AM overlap checking
      const amStart = Math.max(0, seg.startMin);
      const amEnd = Math.min(720, seg.endMin);
      if (amStart < amEnd) {
        amSegments.push({ startMin: amStart, endMin: amEnd, period: seg.period });
      }

      // PM overlap checking
      const pmStart = Math.max(720, seg.startMin) - 720;
      const pmEnd = Math.min(1440, seg.endMin) - 720;
      if (pmStart < pmEnd) {
        pmSegments.push({ startMin: pmStart, endMin: pmEnd, period: seg.period });
      }
    });

    // Check whether current active state is AM or PM to highlight
    const testHour = baseDate.getHours();
    const isCurrentlyPm = testHour >= 12;

    // AM Ring: Radius 79, Stroke Width 5
    amSegments.forEach(seg => {
      // 720 mins = 360 deg -> 1 min = 0.5 deg
      const startAngle = seg.startMin * 0.5;
      const endAngle = seg.endMin * 0.5 + 0.1;
      const pathData = describeArc(100, 100, 79, startAngle, endAngle);

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathData);
      path.setAttribute("class", `tariff-arc ${seg.period} ${!isCurrentlyPm ? 'active-ring' : 'inactive-ring'}`);
      path.setAttribute("stroke-width", "5");
      
      if (!isCurrentlyPm) {
        if (seg.period === "peak") path.setAttribute("filter", "url(#glow-red)");
        if (seg.period === "semi-peak") path.setAttribute("filter", "url(#glow-yellow)");
        if (seg.period === "off-peak") path.setAttribute("filter", "url(#glow-green)");
      }

      tariffSectorsGroup.appendChild(path);
    });

    // PM Ring: Radius 87, Stroke Width 5
    pmSegments.forEach(seg => {
      const startAngle = seg.startMin * 0.5;
      const endAngle = seg.endMin * 0.5 + 0.1;
      const pathData = describeArc(100, 100, 87, startAngle, endAngle);

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathData);
      path.setAttribute("class", `tariff-arc ${seg.period} ${isCurrentlyPm ? 'active-ring' : 'inactive-ring'}`);
      path.setAttribute("stroke-width", "5");

      if (isCurrentlyPm) {
        if (seg.period === "peak") path.setAttribute("filter", "url(#glow-red)");
        if (seg.period === "semi-peak") path.setAttribute("filter", "url(#glow-yellow)");
        if (seg.period === "off-peak") path.setAttribute("filter", "url(#glow-green)");
      }

      tariffSectorsGroup.appendChild(path);
    });
  }
}

/**
 * Main render function that drives updates for the entire interface.
 */
function updateUI() {
  // 1. Get Target Date
  let targetDate;
  if (state.isSimulating) {
    const [year, month, day] = state.simulatedDate.split("-").map(Number);
    const hours = Math.floor(state.simulatedTime / 60);
    const minutes = state.simulatedTime % 60;
    targetDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
  } else {
    targetDate = new Date();
  }

  const hours = targetDate.getHours();
  const minutes = targetDate.getMinutes();
  const seconds = targetDate.getSeconds();
  const ms = targetDate.getMilliseconds();

  // 2. Evaluate current period
  const activePeriod = getTariffForDateTime(targetDate, activeConfig);

  // 3. Update Widget styling classes & glowing themes
  widgetCard.className = `widget-card active-${activePeriod}`;
  tariffBadge.className = `status-badge ${activePeriod}`;
  
  // Set labels
  const labelObj = activeConfig.periods[activePeriod];
  const displayLabel = labelObj ? labelObj.label : activePeriod.toUpperCase();
  
  let chineseLabel = "離峰時間";
  if (activePeriod === "peak") chineseLabel = "尖峰時間";
  if (activePeriod === "semi-peak") chineseLabel = "半尖峰時間";
  tariffLabel.textContent = chineseLabel;

  // Header Title
  const dayType = getDayType(targetDate, activeConfig);
  const season = getActiveSeason(targetDate, activeConfig);
  const seasonText = season ? (season.id === "summer" ? "夏月" : "非夏月") : "未知季節";
  
  let dayTypeText = "工作日";
  if (dayType === "sunday") dayTypeText = "星期日";
  if (dayType === "saturday") dayTypeText = "星期六";
  if (dayType === "offDay") dayTypeText = "離峰日 (休假)";
  
  widgetSeasonLabel.textContent = `${seasonText} - ${dayTypeText}`;

  // 4. Update Digital Time displays
  const dateOptions = { month: 'long', day: 'numeric', weekday: 'short' };
  widgetDate.textContent = targetDate.toLocaleDateString('zh-TW', dateOptions);
  
  const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  widgetDigitalTime.textContent = timeString;

  // 5. Update Hands rotations
  const minAngle = (minutes + seconds / 60) * 6;
  
  let hrAngle;
  if (state.timeFormat === "24h") {
    // 24 hours = 360 deg -> 1 hour = 15 deg.
    // Full sweep handles hours + fractional parts
    hrAngle = ((hours % 24) + minutes / 60 + seconds / 3600) * 15;
    widgetTimeFormatBadge.textContent = "24H";
    clockAmPmLabel.textContent = ""; // Hide AM/PM in 24h mode
  } else {
    // 12 hours = 360 deg -> 1 hour = 30 deg.
    hrAngle = ((hours % 12) + minutes / 60 + seconds / 3600) * 30;
    widgetTimeFormatBadge.textContent = "12H";
    clockAmPmLabel.textContent = hours >= 12 ? "PM" : "AM"; // Show AM/PM
  }

  // Calculate seconds angle based on movement choice
  let secAngle;
  if (state.secondHandMode === "smooth" && !state.isSimulating) {
    secAngle = (seconds + ms / 1000) * 6;
  } else {
    secAngle = seconds * 6;
  }

  hourHand.setAttribute("transform", `rotate(${hrAngle} 100 100)`);
  minuteHand.setAttribute("transform", `rotate(${minAngle} 100 100)`);
  secondHandGroup.setAttribute("transform", `rotate(${secAngle} 100 100)`);

  // 6. Draw color rings dynamically
  drawTariffRings(targetDate);
}

// ==========================================================================
// 6. Theme and CSS Custom Colors Controller
// ==========================================================================

function updateCSSVariables() {
  document.documentElement.style.setProperty('--color-peak', customColors.peak);
  document.documentElement.style.setProperty('--color-semi-peak', customColors["semi-peak"]);
  document.documentElement.style.setProperty('--color-off-peak', customColors["off-peak"]);
}

function handleColorPickerChange(e, period) {
  customColors[period] = e.target.value;
  updateCSSVariables();
  safeStorage.setItem('tariff_custom_colors', JSON.stringify(customColors));
  updateUI();
}

function initCustomColors() {
  const stored = safeStorage.getItem('tariff_custom_colors');
  if (stored) {
    try {
      customColors = JSON.parse(stored);
      colorPeak.value = customColors.peak;
      colorSemiPeak.value = customColors["semi-peak"];
      colorOffPeak.value = customColors["off-peak"];
    } catch(e) {
      console.error("Failed parsing custom colors", e);
    }
  }
  updateCSSVariables();
}

// ==========================================================================
// 7. Simulation Control Panel Handlers
// ==========================================================================

function syncSimulationUI() {
  if (state.isSimulating) {
    resetTimeBtn.classList.add("visible");
    simDateInput.value = state.simulatedDate;
    simTimeSlider.value = state.simulatedTime;
    
    // Display HH:MM
    const h = Math.floor(state.simulatedTime / 60).toString().padStart(2, '0');
    const m = (state.simulatedTime % 60).toString().padStart(2, '0');
    simTimeDisplay.textContent = `${h}:${m}`;
  } else {
    resetTimeBtn.classList.remove("visible");
    
    // Sync current system time into inputs just for display
    const now = new Date();
    const yStr = now.getFullYear();
    const mStr = (now.getMonth() + 1).toString().padStart(2, '0');
    const dStr = now.getDate().toString().padStart(2, '0');
    simDateInput.value = `${yStr}-${mStr}-${dStr}`;
    simTimeSlider.value = now.getHours() * 60 + now.getMinutes();
    simTimeDisplay.textContent = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  }
}

function enterSimulationMode(dateStr, timeMin) {
  state.isSimulating = true;
  state.simulatedDate = dateStr;
  state.simulatedTime = timeMin;
  syncSimulationUI();
  updateUI();
}

function exitSimulationMode() {
  state.isSimulating = false;
  syncSimulationUI();
  updateUI();
}

// ==========================================================================
// 8. JSON Configuration Editor & Storage Persistence
// ==========================================================================

function initJSONEditor() {
  const stored = safeStorage.getItem('tariff_schedule_config');
  if (stored) {
    try {
      activeConfig = JSON.parse(stored);
    } catch(e) {
      console.error("Failed to parse stored config. Resetting to default.", e);
      activeConfig = JSON.parse(JSON.stringify(DEFAULT_TARIFF_SCHEDULE));
    }
  }
  
  // Try fetching local tariff-schedule.json asynchronously for matching workspace edits
  fetch('tariff-schedule.json')
    .then(response => {
      if (!response.ok) throw new Error("CORS or File not found");
      return response.json();
    })
    .then(jsonData => {
      // Automatically keep in sync with local file if it changes on disk and localStorage has not diverged
      if (!stored) {
        activeConfig = jsonData;
        jsonEditor.value = JSON.stringify(activeConfig, null, 2);
        updateUI();
      }
      console.log("Successfully fetched external tariff-schedule.json");
    })
    .catch(err => {
      console.warn("Using internal embedded schedule configuration: ", err.message);
    });

  jsonEditor.value = JSON.stringify(activeConfig, null, 2);
}

function saveJSONConfig() {
  const rawText = jsonEditor.value;
  try {
    const parsed = JSON.parse(rawText);
    
    // Basic verification schema
    if (!parsed.seasons || !parsed.periods || !parsed.defaultPeriod) {
      throw new Error("遺失必要屬性 (seasons, periods 或 defaultPeriod)");
    }

    activeConfig = parsed;
    safeStorage.setItem('tariff_schedule_config', JSON.stringify(activeConfig));
    jsonErrorMsg.classList.add("hidden");
    
    // Animate save feedback
    saveJsonBtn.textContent = "已儲存 ✓";
    saveJsonBtn.style.backgroundColor = "var(--color-off-peak)";
    setTimeout(() => {
      saveJsonBtn.textContent = "儲存設定";
      saveJsonBtn.style.backgroundColor = "";
    }, 1500);

    updateUI();
  } catch(err) {
    jsonErrorMsg.textContent = `錯誤: ${err.message}`;
    jsonErrorMsg.classList.remove("hidden");
  }
}

function resetJSONConfig() {
  if (confirm("確定要將電價設定還原成預設值嗎？")) {
    activeConfig = JSON.parse(JSON.stringify(DEFAULT_TARIFF_SCHEDULE));
    safeStorage.removeItem('tariff_schedule_config');
    jsonEditor.value = JSON.stringify(activeConfig, null, 2);
    jsonErrorMsg.classList.add("hidden");
    updateUI();
  }
}

// ==========================================================================
// 9. Event Listeners & Bootstrapping
// ==========================================================================

function setupEventListeners() {
  // Format Switches
  timeFormatSwitch.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    
    timeFormatSwitch.querySelectorAll("button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.timeFormat = btn.dataset.value;
    
    // Re-draw clock face numbers and dial arcs
    generateClockDial();
    updateUI();
  });

  themeSwitch.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    
    themeSwitch.querySelectorAll("button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.theme = btn.dataset.value;
    
    if (state.theme === "light") {
      document.body.classList.remove("dark-theme");
      document.body.classList.add("light-theme");
    } else {
      document.body.classList.remove("light-theme");
      document.body.classList.add("dark-theme");
    }
  });

  secondHandSwitch.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    
    secondHandSwitch.querySelectorAll("button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.secondHandMode = btn.dataset.value;
  });

  // Widget Mode Toggles (With Hands)
  widgetModeBtn.addEventListener("click", () => {
    document.body.classList.remove("widgy-mode");
    document.body.classList.toggle("widget-mode");
    updateUI();
  });

  // Widgy Widget Mode Toggle (No Hands, 12h)
  widgyModeBtn.addEventListener("click", () => {
    const isWidgy = document.body.classList.toggle("widgy-mode");
    if (isWidgy) {
      document.body.classList.add("widget-mode");
      state.timeFormat = "12h";
      // Sync dashboard buttons
      timeFormatSwitch.querySelectorAll("button").forEach(b => {
        if (b.dataset.value === "12h") b.classList.add("active");
        else b.classList.remove("active");
      });
      generateClockDial();
    } else {
      document.body.classList.remove("widget-mode");
    }
    updateUI();
  });

  exitWidgetModeBtn.addEventListener("click", () => {
    document.body.classList.remove("widget-mode");
    document.body.classList.remove("widgy-mode");
    updateUI();
  });

  // Format Toggle inside full-screen Widget Mode
  widgetFormatToggleBtn.addEventListener("click", () => {
    state.timeFormat = state.timeFormat === "12h" ? "24h" : "12h";
    
    // Synchronize the segmented switcher in the dashboard
    const segments = timeFormatSwitch.querySelectorAll("button");
    segments.forEach(b => {
      if (b.dataset.value === state.timeFormat) b.classList.add("active");
      else b.classList.remove("active");
    });
    
    generateClockDial();
    updateUI();
  });

  // Simulation controls
  simDateInput.addEventListener("input", (e) => {
    state.isSimulating = true;
    state.simulatedDate = e.target.value;
    syncSimulationUI();
    updateUI();
  });

  simTimeSlider.addEventListener("input", (e) => {
    state.isSimulating = true;
    state.simulatedTime = parseInt(e.target.value);
    syncSimulationUI();
    updateUI();
  });

  resetTimeBtn.addEventListener("click", exitSimulationMode);

  // Simulation presets trigger
  presetButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const date = btn.dataset.date;
      const time = parseInt(btn.dataset.time);
      enterSimulationMode(date, time);
    });
  });

  // Color Pickers
  colorPeak.addEventListener("input", (e) => handleColorPickerChange(e, "peak"));
  colorSemiPeak.addEventListener("input", (e) => handleColorPickerChange(e, "semi-peak"));
  colorOffPeak.addEventListener("input", (e) => handleColorPickerChange(e, "off-peak"));

  // JSON configuration actions
  saveJsonBtn.addEventListener("click", saveJSONConfig);
  resetJsonBtn.addEventListener("click", resetJSONConfig);
  
  // Clean up error msg on type
  jsonEditor.addEventListener("input", () => {
    jsonErrorMsg.classList.add("hidden");
  });

  // Double-click (PC) or Double-tap (Mobile) anywhere to exit widget/widgy mode
  const exitWidgetAndWidgyMode = () => {
    if (document.body.classList.contains("widget-mode")) {
      document.body.classList.remove("widget-mode");
      document.body.classList.remove("widgy-mode");
      // Clear URL hash without page reload
      history.replaceState(null, null, ' ');
      updateUI();
    }
  };

  document.body.addEventListener("dblclick", exitWidgetAndWidgyMode);

  let lastTapTime = 0;
  document.body.addEventListener("touchend", (e) => {
    const currentTime = new Date().getTime();
    const tapLength = currentTime - lastTapTime;
    if (tapLength < 400 && tapLength > 0) {
      // Double tap detected
      exitWidgetAndWidgyMode();
      e.preventDefault();
    }
    lastTapTime = currentTime;
  });
}

/**
 * Main Loop: Uses requestAnimationFrame to provide buttery smooth sweeps.
 */
function tick() {
  updateUI();
  requestAnimationFrame(tick);
}

// Initialize Application
function init() {
  const hash = window.location.hash;
  const search = window.location.search;

  // Check if URL specifies Widgy Mode (no hands, 12h)
  if (hash === "#widget" || hash.includes("widgy") || search.includes("mode=widgy")) {
    document.body.classList.add("widget-mode");
    document.body.classList.add("widgy-mode");
    state.timeFormat = "12h";
  } 
  // Check if URL specifies Widget Preview Mode (with hands)
  else if (hash === "#preview" || hash.includes("preview") || search.includes("mode=widget")) {
    document.body.classList.add("widget-mode");
  }

  initCustomColors();
  initJSONEditor();
  generateClockDial();
  setupEventListeners();
  syncSimulationUI();
  
  // Sync the format switch UI active segment button
  if (document.body.classList.contains("widgy-mode")) {
    const segments = timeFormatSwitch.querySelectorAll("button");
    segments.forEach(b => {
      if (b.dataset.value === "12h") b.classList.add("active");
      else b.classList.remove("active");
    });
  }
  
  // Synchronously render the UI immediately so background screenshotting captures it
  updateUI();
  
  // Start the render loop for foreground interaction
  requestAnimationFrame(tick);
}

// Boot
init();

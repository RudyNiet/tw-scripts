/*
 * Script Name: Multi-Target Village Snipe
 * Version: v1.2.0
 * Author: RudyNiet
 * Description: Universal Multi-Target Snipe Calculator with live tab title timer, high-visibility highlights & clean session runs.
 */

var scriptData = {
    prefix: 'rudyMultiSnipe',
    name: 'Multi-Target Snipe Calculator',
    version: 'v1.2.0',
    author: 'RudyNiet'
};

var LS_PREFIX = 'rudyMultiSnipe';
var TIME_INTERVAL = 60 * 60 * 1000 * 24;
var GROUP_ID = localStorage.getItem(`${LS_PREFIX}_chosen_group`) ?? 0;
var LAST_UPDATED_TIME = localStorage.getItem(`${LS_PREFIX}_last_updated`) ?? 0;

var originalDocumentTitle = document.title;
var unitInfo, villages = [], troopCounts = [];

// ALWAYS START FRESH: Clear previously stored targets on new run
localStorage.removeItem(`${LS_PREFIX}_targets`);
var selectedCommandsQueue = [];

var liveSnipesList = [];
var nextLaunchInterval = null;

if (LAST_UPDATED_TIME !== null && Date.parse(new Date()) < LAST_UPDATED_TIME + TIME_INTERVAL) {
    unitInfo = JSON.parse(localStorage.getItem(`${LS_PREFIX}_unit_info`));
} else {
    fetchUnitInfo();
}

async function startScript() {
    villages = await fetchAllPlayerVillagesByGroup(GROUP_ID);
    troopCounts = await fetchTroopsForCurrentGroup(GROUP_ID);

    const isVillageScreen = game_data.screen === 'info_village';

    if (isVillageScreen) {
        enableCommandSelector();
        UI.SuccessMessage('Snipe mode active: Click commands on the page to select them.', 3000);
    } else {
        openMainInterface(false);
    }
}

function enableCommandSelector() {
    // Inject custom styling for command highlighting & high z-index popups
    if (jQuery('#rudySnipeStyles').length === 0) {
        jQuery('head').append(getCustomStyles());
    }

    if (jQuery('#rudySnipeTrigger').length === 0) {
        jQuery('body').append(`
            <div id="rudySnipeTrigger" style="position: fixed; bottom: 20px; right: 20px; z-index: 999999; background: #f4e4bc; border: 2px solid #603000; padding: 10px; border-radius: 5px; box-shadow: 0 4px 10px rgba(0,0,0,0.5);">
                <span style="font-weight:bold; margin-right: 10px; color: #603000;">Selected: <span id="rudySelectedCount">0</span></span>
                <button id="rudyOpenModalBtn" class="btn btn-confirm-yes" style="padding: 5px 10px; font-weight: bold;">
                    🎯 Open Snipe Calculator
                </button>
            </div>
        `);

        jQuery('#rudyOpenModalBtn').on('click', function () {
            openMainInterface(true);
        });
    }

    // Bind click listeners to incoming & outgoing command rows with clear toggle highlighting
    jQuery('#commands_outgoings tr.command-row, #commands_incomings tr.command-row').off('click.rudySnipe').on('click.rudySnipe', function () {
        const rawTime = jQuery(this).find('td:eq(1)').text().trim();
        const landingTime = getTimeFromString(rawTime);
        const destination = getDestinationVillageCoords();

        if (!landingTime || !destination) return;

        const existsIndex = selectedCommandsQueue.findIndex(t => t.destination === destination && t.landingTime === landingTime);

        if (existsIndex > -1) {
            selectedCommandsQueue.splice(existsIndex, 1);
            jQuery(this).removeClass('rudy-selected-cmd');
            UI.InfoMessage('Target removed from selection.');
        } else {
            selectedCommandsQueue.push({ destination, landingTime });
            jQuery(this).addClass('rudy-selected-cmd');
            UI.SuccessMessage('Target added to snipe calculator!');
        }

        jQuery('#rudySelectedCount').text(selectedCommandsQueue.length);
    });
}

async function openMainInterface(isVillageScreen) {
    const groups = await fetchVillageGroups();
    const groupsFilter = renderGroupsFilter(groups);
    const unitsTable = buildUnitsChooserTable();

    const content = `
        <div id="rudySnipeModal" class="rudy-modal">
            <div class="rudy-modal-content">
                <div class="rudy-modal-header">
                    <h2>🎯 ${scriptData.name} <small>v${scriptData.version} - by ${scriptData.author}</small></h2>
                    <span class="rudy-close">&times;</span>
                </div>
                
                <div id="rudyNextLaunchBanner" class="rudy-next-launch" style="display:none;">
                    ⏱️ Next Launch In: <span id="rudyNextTimer" class="rudy-countdown">00:00:00</span>
                </div>

                <div class="rudy-modal-body">
                    <div class="rudy-tabs">
                        <button class="rudy-tab-btn active" data-tab="tab-targets">1. Targets & Setup</button>
                        <button class="rudy-tab-btn" data-tab="tab-import">2. Import / Export</button>
                    </div>

                    <!-- TAB 1: TARGETS & SETUP -->
                    <div id="tab-targets" class="rudy-tab-content active">
                        ${isVillageScreen ? `<div class="rudy-alert info">💡 Click incoming/outgoing commands on the village page to select/unselect them.</div>` : ''}
                        
                        <div class="rudy-grid-top">
                            <div>
                                <label><strong>Group Filter</strong></label>
                                ${groupsFilter}
                            </div>
                            <div>
                                <label><strong>Sigil (%)</strong></label>
                                <input id="rudySigil" type="number" value="0" min="0" max="100">
                            </div>
                            <div>
                                <label><strong>Min. Troop Amount</strong></label>
                                <input id="rudyMinAmount" type="number" value="50">
                            </div>
                        </div>

                        <div class="rudy-section">
                            <h3>Targets List</h3>
                            <table class="vis rudy-table" width="100%" id="rudyTargetsTable">
                                <thead>
                                    <tr>
                                        <th>Target Coords</th>
                                        <th>Landing Time (dd/mm/yyyy HH:mm:ss)</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody></tbody>
                            </table>
                            <button id="rudyAddRowBtn" class="btn" style="margin-top:5px;">+ Add Target Manually</button>
                        </div>

                        <div class="rudy-section">
                            <h3>Select Snipe Units</h3>
                            ${unitsTable}
                        </div>

                        <div class="rudy-actions">
                            <button id="rudyCalculateBtn" class="btn btn-confirm-yes" style="font-size:14px; padding: 6px 12px;">🚀 Calculate Launch Times</button>
                            <button id="rudyResetBtn" class="btn btn-cancel">Reset All</button>
                        </div>

                        <div id="rudyResultsArea" style="display:none; margin-top:15px;">
                            <h3>Calculated Options (<span id="rudyResultCount">0</span>)</h3>
                            <div id="rudyResultsTable"></div>
                            <button id="rudyExportBBBtn" class="btn" style="margin-top:10px;">Copy BB-Code</button>
                        </div>
                    </div>

                    <!-- TAB 2: IMPORT / EXPORT -->
                    <div id="tab-import" class="rudy-tab-content">
                        <div class="rudy-section">
                            <h3>Share or Load Target Lists</h3>
                            <p>Export target list to share with tribemates, or paste an imported list below.</p>
                            <textarea id="rudyShareBox" style="width:100%; height:160px; font-family:monospace;"></textarea>
                            <div style="margin-top: 10px;">
                                <button id="rudyImportActionBtn" class="btn btn-confirm-yes">Import List into Calculator</button>
                                <button id="rudyExportActionBtn" class="btn">Generate Export String</button>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    `;

    if (jQuery('#rudySnipeStyles').length === 0) {
        jQuery('head').append(getCustomStyles());
    }

    jQuery('#rudySnipeModal').remove();
    jQuery('body').append(content);

    renderTargetsTable();
    bindModalEvents();
}

function bindModalEvents() {
    const modal = jQuery('#rudySnipeModal');

    modal.find('.rudy-close').on('click', () => {
        modal.hide();
        stopTimerAndRestoreTitle();
    });
    
    modal.find('.rudy-tab-btn').on('click', function () {
        modal.find('.rudy-tab-btn').removeClass('active');
        modal.find('.rudy-tab-content').removeClass('active');
        jQuery(this).addClass('active');
        jQuery('#' + jQuery(this).data('tab')).addClass('active');
    });

    jQuery('#rudyAddRowBtn').on('click', () => addTargetRowUI());
    jQuery('#rudyCalculateBtn').on('click', calculateLaunchTimes);
    jQuery('#rudyResetBtn').on('click', resetScriptData);
    jQuery('#rudyGroupsFilter').on('change', (e) => {
        localStorage.setItem(`${LS_PREFIX}_chosen_group`, e.target.value);
        GROUP_ID = e.target.value;
        startScript();
    });

    jQuery('#rudyExportActionBtn').on('click', () => {
        const configData = {
            targets: getTargetsFromUI(),
            sigil: jQuery('#rudySigil').val(),
            minAmount: jQuery('#rudyMinAmount').val()
        };
        jQuery('#rudyShareBox').val(JSON.stringify(configData));
        UI.SuccessMessage('Export string generated!');
    });

    jQuery('#rudyImportActionBtn').on('click', () => {
        try {
            const parsed = JSON.parse(jQuery('#rudyShareBox').val().trim());
            const list = Array.isArray(parsed) ? parsed : parsed.targets;
            if (list && list.length > 0) {
                selectedCommandsQueue = list;
                renderTargetsTable();
                jQuery('.rudy-tab-btn[data-tab="tab-targets"]').click();
                UI.SuccessMessage('Targets successfully imported!');
            }
        } catch (e) {
            UI.ErrorMessage('Invalid import format.');
        }
    });

    jQuery('#rudyExportBBBtn').on('click', exportBBCode);
}

function renderTargetsTable() {
    const tbody = jQuery('#rudyTargetsTable tbody');
    tbody.empty();

    if (selectedCommandsQueue.length === 0) {
        addTargetRowUI();
    } else {
        selectedCommandsQueue.forEach(t => addTargetRowUI(t.destination, t.landingTime));
    }
}

function addTargetRowUI(coords = '', time = '') {
    const row = `
        <tr class="rudy-target-row">
            <td><input type="text" class="rudy-target-coords" value="${coords}" placeholder="500|500"></td>
            <td><input type="text" class="rudy-target-time" value="${time}" placeholder="dd/mm/yyyy HH:mm:ss"></td>
            <td><button class="btn btn-cancel" onclick="jQuery(this).closest('tr').remove();">X</button></td>
        </tr>
    `;
    jQuery('#rudyTargetsTable tbody').append(row);
}

function getTargetsFromUI() {
    const targets = [];
    jQuery('.rudy-target-row').each(function () {
        const coords = jQuery(this).find('.rudy-target-coords').val().trim();
        const time = jQuery(this).find('.rudy-target-time').val().trim();
        if (coords && time) {
            targets.push({ destination: coords, landingTime: time });
        }
    });
    return targets;
}

function calculateLaunchTimes() {
    const targets = getTargetsFromUI();
    const minAmount = parseInt(jQuery('#rudyMinAmount').val().trim());
    const chosenUnits = [];

    jQuery('.rudy-unit-selector:checked').each(function () {
        chosenUnits.push(this.value);
    });

    if (!targets.length || !chosenUnits.length) {
        UI.ErrorMessage('Please add at least one target and select units.');
        return;
    }

    const serverTime = getServerTime().getTime();
    liveSnipesList = [];

    targets.forEach((target) => {
        const landingMs = getLandingTime(target.landingTime);

        villages.forEach((village) => {
            const distance = calculateDistance(village.coords, target.destination);

            chosenUnits.forEach((unit) => {
                const launchMs = getLaunchTime(unit, landingMs, distance);
                if (launchMs > serverTime && distance > 0) {
                    const troops = troopCounts.find((t) => t.villageId === village.id);
                    if (troops && troops[unit] >= (unit === 'snob' ? 1 : minAmount)) {
                        liveSnipesList.push({
                            id: village.id,
                            name: village.name,
                            coords: village.coords,
                            targetCoords: target.destination,
                            unit: unit,
                            distance: distance,
                            launchMs: launchMs,
                            formattedLaunch: formatDateTime(launchMs),
                            unitAmount: troops[unit]
                        });
                    }
                }
            });
        });
    });

    liveSnipesList.sort((a, b) => a.launchMs - b.launchMs);

    if (liveSnipesList.length > 0) {
        jQuery('#rudyResultsArea').show();
        updateResultsDisplay();
        startMasterCountdown();
        UI.SuccessMessage(`${liveSnipesList.length} snipe options calculated!`);
    } else {
        jQuery('#rudyResultsArea').hide();
        jQuery('#rudyNextLaunchBanner').hide();
        stopTimerAndRestoreTitle();
        UI.ErrorMessage('No available snipe options found for selected targets.');
    }
}

function updateResultsDisplay() {
    const now = getServerTime().getTime();
    liveSnipesList = liveSnipesList.filter(s => s.launchMs > now);

    if (liveSnipesList.length === 0) {
        jQuery('#rudyResultsArea').hide();
        jQuery('#rudyNextLaunchBanner').hide();
        stopTimerAndRestoreTitle();
        UI.InfoMessage('All calculated snipe options have expired.');
        return;
    }

    jQuery('#rudyResultCount').text(liveSnipesList.length);
    jQuery('#rudyResultsTable').html(buildResultsTable(liveSnipesList));
    jQuery('#rudyExportBBBtn').attr('data-json', JSON.stringify(liveSnipesList));
    Timing.tickHandlers.timers.init();
}

function startMasterCountdown() {
    if (nextLaunchInterval) clearInterval(nextLaunchInterval);
    jQuery('#rudyNextLaunchBanner').show();

    nextLaunchInterval = setInterval(() => {
        const now = getServerTime().getTime();
        
        if (liveSnipesList.length > 0 && liveSnipesList[0].launchMs <= now) {
            updateResultsDisplay();
        }

        if (liveSnipesList.length > 0) {
            const nextLaunchMs = liveSnipesList[0].launchMs;
            const diffSec = Math.max(0, Math.floor((nextLaunchMs - now) / 1000));
            const formattedTime = secondsToHms(diffSec);

            jQuery('#rudyNextTimer').text(formattedTime);
            document.title = `⏱️ [${formattedTime}] ${scriptData.name}`;
        } else {
            jQuery('#rudyNextLaunchBanner').hide();
            stopTimerAndRestoreTitle();
        }
    }, 1000);
}

function stopTimerAndRestoreTitle() {
    if (nextLaunchInterval) clearInterval(nextLaunchInterval);
    document.title = originalDocumentTitle;
}

function buildResultsTable(snipes) {
    let html = `
        <table class="vis rudy-table" width="100%">
            <thead>
                <tr>
                    <th>#</th>
                    <th>From Village</th>
                    <th>Target</th>
                    <th>Unit</th>
                    <th>Distance</th>
                    <th>Launch Time</th>
                    <th>Remaining</th>
                    <th>Send</th>
                </tr>
            </thead>
            <tbody>
    `;

    const serverMs = getServerTime().getTime();

    snipes.forEach((s, idx) => {
        const [x, y] = s.targetCoords.split('|');
        const remaining = secondsToHms((s.launchMs - serverMs) / 1000);
        const url = `/game.php?village=${s.id}&screen=place&x=${x}&y=${y}&${s.unit}=${s.unitAmount}`;

        html += `
            <tr class="rudy-snipe-row">
                <td>${idx + 1}</td>
                <td><a href="/game.php?screen=info_village&id=${s.id}" target="_blank">${s.name} (${s.coords})</a></td>
                <td><strong>${s.targetCoords}</strong></td>
                <td><img src="/graphic/unit/unit_${s.unit}.webp"/> ${s.unitAmount}</td>
                <td>${parseFloat(s.distance).toFixed(2)}</td>
                <td>${s.formattedLaunch}</td>
                <td><span class="timer" data-endtime>${remaining}</span></td>
                <td><a href="${url}" target="_blank" class="btn btn-confirm-yes">Send</a></td>
            </tr>
        `;
    });

    return html + '</tbody></table>';
}

function exportBBCode() {
    const raw = jQuery('#rudyExportBBBtn').attr('data-json');
    if (!raw) return;
    const snipes = JSON.parse(raw);
    let bb = `[table][**]Target[||]From[||]Unit[||]Launch Time[||]Command[/**]\n`;
    snipes.forEach((s) => {
        const [x, y] = s.targetCoords.split('|');
        const url = `${window.location.origin}/game.php?village=${s.id}&screen=place&x=${x}&y=${y}&${s.unit}=${s.unitAmount}`;
        bb += `[*][b]${s.targetCoords}[/b][|]${s.coords}[|][unit]${s.unit}[/unit] ${s.unitAmount}[|]${s.formattedLaunch}[|][url=${url}]Send[/url]\n`;
    });
    bb += `[/table]`;

    jQuery('#rudyShareBox').val(bb);
    jQuery('.rudy-tab-btn[data-tab="tab-import"]').click();
    UI.SuccessMessage('BB-Code exported to Tab 2!');
}

function getCustomStyles() {
    return `
        <style id="rudySnipeStyles">
            /* Force game alerts and popups to display ABOVE the modal */
            #popups_wrapper, .popup_box, #faded, #UI_ErrorMessage, #UI_SuccessMessage, #UI_InfoMessage, .autoComplete {
                z-index: 99999999 !important;
                position: fixed !important;
            }
            .rudy-modal { display: block; position: fixed; z-index: 999998; left: 0; top: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); overflow: auto; }
            .rudy-modal-content { background: #f4e4bc; border: 2px solid #603000; margin: 3% auto; padding: 15px; width: 85%; max-width: 950px; border-radius: 5px; box-shadow: 0 5px 15px rgba(0,0,0,0.5); font-family: Verdana, Arial; }
            .rudy-modal-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #804000; padding-bottom: 5px; }
            .rudy-modal-header h2 { margin: 0; color: #804000; }
            .rudy-close { font-size: 24px; font-weight: bold; cursor: pointer; color: #804000; }
            .rudy-next-launch { background: #603000; color: #fff; text-align: center; padding: 8px; font-size: 16px; font-weight: bold; margin-top: 10px; border-radius: 4px; }
            .rudy-countdown { color: #ffeb3b; font-family: monospace; font-size: 18px; margin-left: 5px; }
            .rudy-tabs { display: flex; gap: 5px; margin: 15px 0 10px; border-bottom: 1px solid #804000; }
            .rudy-tab-btn { background: #dfcca6; border: 1px solid #804000; padding: 8px 15px; cursor: pointer; font-weight: bold; border-radius: 4px 4px 0 0; }
            .rudy-tab-btn.active { background: #c1a26b; border-bottom: 1px solid #c1a26b; }
            .rudy-tab-content { display: none; }
            .rudy-tab-content.active { display: block; }
            .rudy-grid-top { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 15px; background: #e2d0a8; padding: 10px; border-radius: 4px; }
            .rudy-section { margin-bottom: 15px; }
            .rudy-table { border-collapse: collapse; margin-top: 5px; }
            .rudy-table th { background: #c1a26b; padding: 6px; }
            .rudy-table td { padding: 4px; text-align: center; border: 1px solid #d2c29d; }
            tr.rudy-selected-cmd td { background-color: #ffe563 !important; font-weight: bold; }
            .rudy-alert { padding: 8px; margin-bottom: 10px; border-radius: 4px; border: 1px solid #bce8f1; background: #d9edf7; color: #31708f; }
            .rudy-actions { display: flex; gap: 10px; margin-top: 15px; }
        </style>
    `;
}

/* API & Utility Helpers */
function getTimeFromString(timeLand) {
    let serverDate = jQuery('#serverDate').text().split('/');
    let time = timeLand.match(/\d+:\d+:\d+:\d+/) ?? timeLand.match(/\d+:\d+:\d+/);
    time = time ? time[0] : '';

    if (timeLand.includes('today') || timeLand.includes('heute')) {
        return `${serverDate[0]}/${serverDate[1]}/${serverDate[2]} ${time}`;
    } else if (timeLand.includes('tomorrow') || timeLand.includes('morgen')) {
        let tomorrow = new Date(serverDate[1] + '/' + serverDate[0] + '/' + serverDate[2]);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return `${('0' + tomorrow.getDate()).slice(-2)}/${('0' + (tomorrow.getMonth() + 1)).slice(-2)}/${tomorrow.getFullYear()} ${time}`;
    } else {
        let on = timeLand.match(/\d+.\d+/);
        if (on) {
            let dateParts = on[0].split('.');
            return `${dateParts[0]}/${dateParts[1]}/${serverDate[2]} ${time}`;
        }
    }
    return `${serverDate[0]}/${serverDate[1]}/${serverDate[2]} ${time}`;
}

function getDestinationVillageCoords() {
    let villageText = typeof mobiledevice !== 'undefined' && mobiledevice 
        ? jQuery('.mobileKeyValue').eq(0).find('div').eq(0).text() 
        : jQuery('#content_value table table td:eq(2)').text();
    const match = villageText.match(/\d+\|\d+/);
    return match ? match[0] : '';
}

function calculateDistance(from, to) {
    const [x1, y1] = from.split('|');
    const [x2, y2] = to.split('|');
    return Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));
}

function getLaunchTime(unit, landingTime, distance) {
    const msPerMin = 60000;
    const sigilRatio = 1 + (+jQuery('#rudySigil').val() / 100);
    const unitSpeed = unitInfo.config[unit].speed;
    const unitTime = (distance * unitSpeed * msPerMin) / sigilRatio;
    return Math.round((landingTime - unitTime) / 1000) * 1000;
}

function getLandingTime(landingTime) {
    const [landingDay, landingHour] = landingTime.split(' ');
    const [day, month, year] = landingDay.split('/');
    const [hours, minutes, seconds] = landingHour.split(':');
    return new Date(`${year}-${month}-${day}T${hours}:${minutes}:${seconds}`).getTime();
}

function getServerTime() {
    const [day, month, year] = jQuery('#serverDate').text().split('/');
    return new Date(`${year}-${month}-${day}T${jQuery('#serverTime').text()}`);
}

function formatDateTime(dateMs) {
    const d = new Date(dateMs);
    const pad = (n) => n.toString().padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function secondsToHms(d) {
    d = Number(d);
    const h = Math.floor(d / 3600).toString().padStart(2, '0');
    const m = Math.floor((d % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor((d % 3600) % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

function resetScriptData() {
    Object.keys(localStorage).forEach((key) => {
        if (key.startsWith(`${LS_PREFIX}_`)) localStorage.removeItem(key);
    });
    stopTimerAndRestoreTitle();
    window.location.reload();
}

function buildUnitsChooserTable() {
    const storedUnits = JSON.parse(localStorage.getItem(`${LS_PREFIX}_chosen_units`)) || ['spear', 'sword', 'heavy', 'catapult'];
    let th = '', td = '';
    game_data.units.forEach((u) => {
        if (u !== 'spy' && u !== 'militia') {
            const checked = storedUnits.includes(u) ? 'checked' : '';
            th += `<th><img src="/graphic/unit/unit_${u}.webp"></th>`;
            td += `<td><input type="checkbox" class="rudy-unit-selector" value="${u}" ${checked}/></td>`;
        }
    });
    return `<table class="vis rudy-table" width="100%"><thead><tr>${th}</tr></thead><tbody><tr>${td}</tr></tbody></table>`;
}

function renderGroupsFilter(groups) {
    let html = `<select id="rudyGroupsFilter" style="width:100%;">`;
    for (const [_, g] of Object.entries(groups.result)) {
        if (g.name) {
            const sel = parseInt(g.group_id) === parseInt(GROUP_ID) ? 'selected' : '';
            html += `<option value="${g.group_id}" ${sel}>${g.name}</option>`;
        }
    }
    return html + `</select>`;
}

function fetchUnitInfo() {
    jQuery.ajax({ url: '/interface.php?func=get_unit_info' }).done((xml) => {
        unitInfo = xml2json($(xml));
        localStorage.setItem(`${LS_PREFIX}_unit_info`, JSON.stringify(unitInfo));
        localStorage.setItem(`${LS_PREFIX}_last_updated`, Date.parse(new Date()));
    });
}

async function fetchAllPlayerVillagesByGroup(groupId) {
    const url = `${game_data.link_base_pure}groups&ajax=load_villages_from_group`;
    return jQuery.post({ url, data: { group_id: groupId }, dataType: 'json', headers: { 'TribalWars-Ajax': 1 } }).then(({ response }) => {
        const rows = jQuery(new DOMParser().parseFromString(response.html, 'text/html')).find('#group_table > tbody > tr').not(':eq(0)');
        const list = [];
        rows.each(function () {
            const id = jQuery(this).find('td:eq(0) a').attr('data-village-id') || jQuery(this).find('td:eq(0) a').attr('href').match(/\d+/)[0];
            list.push({ id: parseInt(id), name: jQuery(this).find('td:eq(0)').text().trim(), coords: jQuery(this).find('td:eq(1)').text().trim() });
        });
        return list;
    });
}

async function fetchVillageGroups() {
    return jQuery.get(`${game_data.link_base_pure}groups&mode=overview&ajax=load_group_menu`);
}

async function fetchTroopsForCurrentGroup(groupId) {
    return jQuery.get(`${game_data.link_base_pure}overview_villages&mode=combined&group=${groupId}&page=-1`).then((res) => {
        const troops = [];
        const rows = jQuery(jQuery.parseHTML(res)).find('#combined_table tr.nowrap');
        const headers = [];
        jQuery(jQuery.parseHTML(res)).find('#combined_table tr:eq(0) th').each(function () {
            const img = jQuery(this).find('img').attr('src');
            headers.push(img ? img.split('/').pop().replace('.webp', '') : null);
        });

        rows.each(function () {
            let rowData = {};
            headers.forEach((h, idx) => {
                if (h && h.includes('unit_')) {
                    const vId = jQuery(this).find('td:eq(1) span.quickedit-vn').attr('data-id');
                    rowData.villageId = parseInt(vId);
                    rowData[h.replace('unit_', '')] = parseInt(jQuery(this).find(`td:eq(${idx})`).text());
                }
            });
            troops.push(rowData);
        });
        return troops;
    });
}

var xml2json = function ($xml) {
    var data = {};
    $.each($xml.children(), function () {
        var $this = $(this);
        data[$this.prop('tagName')] = $this.children().length > 0 ? xml2json($this) : $.trim($this.text());
    });
    return data;
};

(function () {
    if (!game_data.features.Premium.active) return UI.ErrorMessage('Premium Account required!');
    startScript();
})();

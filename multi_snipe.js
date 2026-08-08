/*
 * Script Name: Multi-Target Village Snipe
 * Version: v3.0.0
 * Author: RedAlert & Adapted for Multi-Targeting
 * Description: Calculate and plan snipes for multiple incoming targets at once.
 */

var scriptData = {
    prefix: 'multiVillageSnipe',
    name: 'Multi-Target Village Snipe',
    version: 'v3.0.0',
    author: 'RedAlert & Community',
    authorUrl: 'https://twscripts.dev/',
    helpLink: 'https://forum.tribalwars.net/',
};

if (typeof DEBUG !== 'boolean') DEBUG = false;
if (typeof REMAINING_TIME_ALERT === 'undefined') REMAINING_TIME_ALERT = '0:00:10';

var LS_PREFIX = 'raMultiVillageSnipe';
var TIME_INTERVAL = 60 * 60 * 1000 * 24 * 1;
var GROUP_ID = localStorage.getItem(`${LS_PREFIX}_chosen_group`) ?? 0;
var LAST_UPDATED_TIME = localStorage.getItem(`${LS_PREFIX}_last_updated`) ?? 0;

var unitInfo,
    villages = [],
    troopCounts = [];

if (LAST_UPDATED_TIME !== null && Date.parse(new Date()) < LAST_UPDATED_TIME + TIME_INTERVAL) {
    unitInfo = JSON.parse(localStorage.getItem(`${LS_PREFIX}_unit_info`));
} else {
    fetchUnitInfo();
}

async function initMultiSnipe(groupId) {
    villages = await fetchAllPlayerVillagesByGroup(groupId);
    troopCounts = await fetchTroopsForCurrentGroup(groupId);
    const groups = await fetchVillageGroups();
    const unitsTable = buildUnitsChoserTable();
    const content = prepareContent(groups, unitsTable);
    renderUI(content);

    // Event Handlers
    jQuery('#addTargetBtn').on('click', addTargetRow);
    jQuery('#calculateLaunchTimes').on('click', calculateLaunchTimes);
    jQuery('#exportConfig').on('click', exportConfig);
    jQuery('#importConfig').on('click', importConfig);
    jQuery('#exportBBCodeBtn').on('click', exportBBCode);
    jQuery('#resetScriptBtn').on('click', resetScriptHandler);
    jQuery('#raGroupsFilter').on('change', filterVillagesByChosenGroup);

    // Load saved targets or initialize with default current village
    loadSavedTargets();
}

function prepareContent(groups, unitsTable) {
    const groupsFilter = renderGroupsFilter(groups);

    return `
        <div class="ra-mb15">
            <div class="ra-grid-top">
                <div>
                    <label>${tt('Group')}</label>
                    ${groupsFilter}
                </div>
                <div>
                    <label>${tt('Sigil (%)')}</label>
                    <input id="raSigil" type="number" value="0">
                </div>
                <div>
                    <label>${tt('Min. Amount')}</label>
                    <input id="raMinAmount" type="number" value="50">
                </div>
            </div>
        </div>

        <div class="ra-mb15">
            <label>${tt('Targets List (Destination | Landing Time dd/mm/yyyy HH:mm:ss)')}</label>
            <table class="ra-table vis" width="100%" id="raTargetsTable">
                <thead>
                    <tr>
                        <th>${tt('Destination Village')}</th>
                        <th>${tt('Landing Time')}</th>
                        <th>${tt('Action')}</th>
                    </tr>
                </thead>
                <tbody>
                    <!-- Rows dynamically generated -->
                </tbody>
            </table>
            <div style="margin-top: 5px;">
                <a href="javascript:void(0);" id="addTargetBtn" class="btn">${tt('Add Target')}</a>
            </div>
        </div>

        <div class="ra-mb15">
            <label>${tt('Choose Units to Snipe')}</label>
            ${unitsTable}
        </div>

        <div class="ra-mb15">
            <a href="javascript:void(0);" id="calculateLaunchTimes" class="btn btn-confirm-yes">${tt('Calculate Launch Times')}</a>
            <a href="javascript:void(0);" id="exportBBCodeBtn" class="btn" data-snipe="">${tt('Export as BB Code')}</a>
            <a href="javascript:void(0);" id="exportConfig" class="btn">${tt('Export Config')}</a>
            <a href="javascript:void(0);" id="importConfig" class="btn">${tt('Import Config')}</a>
            <a href="javascript:void(0);" id="resetScriptBtn" class="btn">${tt('Reset Script')}</a>
        </div>

        <div style="display:none;" class="ra-mb15" id="raPossibleCombinations">
            <label><span id="possibleCombinationsCount">0</span> ${tt('snipe attempts found')}</label>
            <div id="possibleCombinationsTable"></div>
        </div>
    `;
}

function renderUI(body) {
    const content = `
        <div class="ra-single-village-snipe" id="raMultiVillageSnipe">
            <h2>${scriptData.name}</h2>
            <div class="ra-single-village-snipe-data">${body}</div>
        </div>
        <style>
            .ra-single-village-snipe { position: relative; display: block; width: auto; margin: 0 auto 15px; padding: 10px; border: 1px solid #603000; background: #f4e4bc; }
            .ra-single-village-snipe input[type="text"], .ra-single-village-snipe input[type="number"] { width: 100%; padding: 4px; border: 1px solid #000; }
            .ra-grid-top { display: grid; grid-template-columns: 200px 100px 100px; grid-gap: 15px; }
            .ra-table { border-collapse: separate !important; border-spacing: 2px !important; }
            .ra-table th, .ra-table td { padding: 4px; text-align: center; }
            .ra-mb15 { margin-bottom: 15px; }
            .btn-remove-row { color: red; font-weight: bold; cursor: pointer; }
        </style>
    `;

    if (jQuery('#raMultiVillageSnipe').length < 1) {
        jQuery('#contentContainer').prepend(content);
    } else {
        jQuery('.ra-single-village-snipe-data').html(body);
    }
}

function addTargetRow(coords = '', landingTime = '') {
    if (!landingTime) {
        landingTime = new Date().toLocaleString('en-GB').replace(',', '');
    }
    const rowHtml = `
        <tr class="ra-target-row">
            <td><input type="text" class="ra-target-coords" value="${coords}" placeholder="500|500"></td>
            <td><input type="text" class="ra-target-time" value="${landingTime}" placeholder="dd/mm/yyyy HH:mm:ss"></td>
            <td><a href="javascript:void(0);" class="btn btn-remove-row" onclick="jQuery(this).closest('tr').remove();">X</a></td>
        </tr>
    `;
    jQuery('#raTargetsTable tbody').append(rowHtml);
}

function getTargetsFromUI() {
    const targets = [];
    jQuery('.ra-target-row').each(function () {
        const coords = jQuery(this).find('.ra-target-coords').val().trim();
        const time = jQuery(this).find('.ra-target-time').val().trim();
        if (coords && time) {
            targets.push({ destination: coords, landingTime: time });
        }
    });
    return targets;
}

function calculateLaunchTimes() {
    const targets = getTargetsFromUI();
    const minAmount = parseInt(jQuery('#raMinAmount').val().trim());
    const chosenUnits = [];

    jQuery('.ra-unit-selector:checked').each(function () {
        chosenUnits.push(this.value);
    });

    if (!targets.length || !chosenUnits.length) {
        UI.ErrorMessage('Please enter at least one target and select units.');
        return;
    }

    saveCurrentConfig(targets, chosenUnits);

    const serverTime = getServerTime().getTime();
    const allRealSnipes = [];

    targets.forEach((target) => {
        const landingTimeObj = getLandingTime(target.landingTime);

        villages.forEach((village) => {
            const distance = calculateDistance(village.coords, target.destination);

            chosenUnits.forEach((unit) => {
                const launchTime = getLaunchTime(unit, landingTimeObj, distance);
                if (launchTime > serverTime && distance > 0) {
                    // Check troop availability
                    const villageTroops = troopCounts.find((t) => t.villageId === village.id);
                    if (villageTroops && villageTroops[unit] >= (unit === 'snob' ? 1 : minAmount)) {
                        allRealSnipes.push({
                            id: village.id,
                            name: village.name,
                            coords: village.coords,
                            targetCoords: target.destination,
                            unit: unit,
                            distance: distance,
                            launchTime: launchTime,
                            formattedLaunchTime: formatDateTime(launchTime),
                            landingTime: target.landingTime,
                            unitAmount: villageTroops[unit],
                        });
                    }
                }
            });
        });
    });

    allRealSnipes.sort((a, b) => a.launchTime - b.launchTime);

    if (allRealSnipes.length > 0) {
        const tableHtml = buildCombinationsTable(allRealSnipes);
        jQuery('#raPossibleCombinations').show();
        jQuery('#possibleCombinationsCount').text(allRealSnipes.length);
        jQuery('#possibleCombinationsTable').html(tableHtml);
        jQuery('#exportBBCodeBtn').attr('data-snipe', JSON.stringify(allRealSnipes));
        Timing.tickHandlers.timers.init();
    } else {
        UI.ErrorMessage('No possible snipe options found!');
        jQuery('#raPossibleCombinations').hide();
    }
}

function buildCombinationsTable(snipes) {
    let table = `
        <table class="ra-table vis" width="100%">
            <thead>
                <tr>
                    <th>#</th>
                    <th>From</th>
                    <th>Target</th>
                    <th>Unit</th>
                    <th>Distance</th>
                    <th>Launch Time</th>
                    <th>Send in</th>
                    <th>Send</th>
                </tr>
            </thead>
            <tbody>
    `;

    const serverTime = getServerTime().getTime();

    snipes.forEach((snipe, index) => {
        const [toX, toY] = snipe.targetCoords.split('|');
        const timeTillLaunch = secondsToHms((snipe.launchTime - serverTime) / 1000);
        const commandUrl = `/game.php?village=${snipe.id}&screen=place&x=${toX}&y=${toY}&${snipe.unit}=${snipe.unitAmount}`;

        table += `
            <tr>
                <td>${index + 1}</td>
                <td><a href="/game.php?screen=info_village&id=${snipe.id}" target="_blank">${snipe.name} (${snipe.coords})</a></td>
                <td><strong>${snipe.targetCoords}</strong></td>
                <td><img src="/graphic/unit/unit_${snipe.unit}.webp" /> ${snipe.unitAmount}</td>
                <td>${parseFloat(snipe.distance).toFixed(2)}</td>
                <td>${snipe.formattedLaunchTime}</td>
                <td><span class="timer" data-endtime>${timeTillLaunch}</span></td>
                <td><a href="${commandUrl}" target="_blank" class="btn">Send</a></td>
            </tr>
        `;
    });

    table += '</tbody></table>';
    return table;
}

function exportConfig() {
    const configData = {
        targets: getTargetsFromUI(),
        sigil: jQuery('#raSigil').val(),
        minAmount: jQuery('#raMinAmount').val(),
    };
    const content = `<div class="ra-popup-content"><textarea readonly id="exportArea" style="width:100%;height:150px;">${JSON.stringify(configData)}</textarea></div>`;
    Dialog.show('export_dialog', content);
    jQuery('#exportArea').select();
}

function importConfig() {
    const content = `
        <div class="ra-popup-content">
            <textarea id="importArea" style="width:100%;height:150px;" placeholder="Paste JSON config here..."></textarea>
            <br/><a href="javascript:void(0);" id="processImportBtn" class="btn">Import</a>
        </div>
    `;
    Dialog.show('import_dialog', content);

    jQuery('#processImportBtn').on('click', function () {
        try {
            const data = JSON.parse(jQuery('#importArea').val().trim());
            if (data.targets && Array.isArray(data.targets)) {
                jQuery('#raTargetsTable tbody').empty();
                data.targets.forEach((t) => addTargetRow(t.destination, t.landingTime));
                if (data.sigil) jQuery('#raSigil').val(data.sigil);
                if (data.minAmount) jQuery('#raMinAmount').val(data.minAmount);
                UI.SuccessMessage('Import successful!');
                Dialog.close();
            }
        } catch (e) {
            UI.ErrorMessage('Invalid Configuration JSON.');
        }
    });
}

function saveCurrentConfig(targets, chosenUnits) {
    localStorage.setItem(`${LS_PREFIX}_targets`, JSON.stringify(targets));
    localStorage.setItem(`${LS_PREFIX}_chosen_units`, JSON.stringify(chosenUnits));
}

function loadSavedTargets() {
    const savedTargets = JSON.parse(localStorage.getItem(`${LS_PREFIX}_targets`));
    if (savedTargets && savedTargets.length > 0) {
        savedTargets.forEach((t) => addTargetRow(t.destination, t.landingTime));
    } else {
        // Fallback default
        let villageCoords = jQuery('#content_value table table td:eq(2)').text().match(/\d+\|\d+/);
        villageCoords = villageCoords ? villageCoords[0] : '';
        addTargetRow(villageCoords);
    }
}

/* Helpers */
function calculateDistance(from, to) {
    const [x1, y1] = from.split('|');
    const [x2, y2] = to.split('|');
    return Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));
}

function getLaunchTime(unit, landingTime, distance) {
    const msPerMin = 60000;
    const sigilRatio = 1 + (+jQuery('#raSigil').val() / 100);
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

function filterVillagesByChosenGroup(e) {
    localStorage.setItem(`${LS_PREFIX}_chosen_group`, e.target.value);
    initMultiSnipe(e.target.value);
}

function resetScriptHandler() {
    Object.keys(localStorage).forEach((key) => {
        if (key.startsWith(`${LS_PREFIX}_`)) localStorage.removeItem(key);
    });
    window.location.reload();
}

function exportBBCode() {
    const raw = jQuery('#exportBBCodeBtn').attr('data-snipe');
    if (!raw) return UI.ErrorMessage('Nothing to export!');
    const snipes = JSON.parse(raw);
    let bb = `[table][**]Target[||]From[||]Unit[||]Launch Time[||]Command[/**]\n`;
    snipes.forEach((s) => {
        const [toX, toY] = s.targetCoords.split('|');
        const url = `${window.location.origin}/game.php?village=${s.id}&screen=place&x=${toX}&y=${toY}&${s.unit}=${s.unitAmount}`;
        bb += `[*][b]${s.targetCoords}[/b][|]${s.coords}[|][unit]${s.unit}[/unit] ${s.unitAmount}[|]${s.formattedLaunchTime}[|][url=${url}]Send[/url]\n`;
    });
    bb += `[/table]`;

    Dialog.show('bbcode_export', `<div class="ra-popup-content"><textarea readonly style="width:100%;height:150px;">${bb}</textarea></div>`);
}

function buildUnitsChoserTable() {
    const storedUnits = JSON.parse(localStorage.getItem(`${LS_PREFIX}_chosen_units`)) || ['spear', 'sword', 'heavy', 'catapult'];
    let th = '', td = '';
    game_data.units.forEach((u) => {
        if (u !== 'spy' && u !== 'militia') {
            const checked = storedUnits.includes(u) ? 'checked' : '';
            th += `<th><img src="/graphic/unit/unit_${u}.webp"></th>`;
            td += `<td><input type="checkbox" class="ra-unit-selector" value="${u}" ${checked}/></td>`;
        }
    });
    return `<table class="ra-table vis" width="100%"><thead><tr>${th}</tr></thead><tbody><tr>${td}</tr></tbody></table>`;
}

function renderGroupsFilter(groups) {
    const currentGroup = localStorage.getItem(`${LS_PREFIX}_chosen_group`) ?? 0;
    let html = `<select id="raGroupsFilter">`;
    for (const [_, g] of Object.entries(groups.result)) {
        if (g.name) {
            const sel = parseInt(g.group_id) === parseInt(currentGroup) ? 'selected' : '';
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

function tt(str) { return str; } // Prepared for English texts

(function () {
    if (!game_data.features.Premium.active) return UI.ErrorMessage('Premium Account required!');
    initMultiSnipe(GROUP_ID);
})();

const BOND_REAL_PRICES = {
    USD: { price: 8.99, symbol: '$' },
    GBP: { price: 6.49, symbol: '£' },
    EUR: { price: 7.99, symbol: '€' },
    CAD: { price: 11.49, symbol: '$' },
    AUD: { price: 12.99, symbol: '$' },
    BRL: { price: 21.99, symbol: 'R$' },
    DKK: { price: 57.00, symbol: 'kr.' },
    SEK: { price: 77.00, symbol: 'kr' }
};

let allItems = [];
let bondPrice = 0;
let currentPage = 1;
const pageSize = 25;
let itemImages = {};
let sortBy = 'volume';
let sortDirection = 'desc';

async function loadImages() {
    try {
        const response = await fetch('item_images.json');
        itemImages = await response.json();
    } catch (e) {
        console.log('No item images loaded');
    }
}

async function loadData() {
    try {
        const response = await fetch('https://chisel.weirdgloop.org/gazproj/gazbot/rs_dump.json');
        const data = await response.json();
        
        const timestamp = data['%JAGEX_TIMESTAMP%'];
        if (timestamp) {
            const date = new Date(timestamp * 1000);
            document.getElementById('lastUpdate').textContent = `Grand Exchange last updated ${date.toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}`;
        }
        
        allItems = Object.entries(data)
            .filter(([key]) => !key.startsWith('%'))
            .map(([id, item]) => ({ 
                name: item.name, 
                gp: item.price || 0, 
                volume: item.volume ?? null 
            }));
        
        const bond = allItems.find(i => i.name === 'Bond');
        bondPrice = bond ? bond.gp : 115879148;
        
        if (itemImages['Bond']) {
            const bondThumb = document.getElementById('bondThumb');
            bondThumb.src = itemImages['Bond'];
            bondThumb.style.display = 'inline';
        }
        document.getElementById('bondPriceCard').textContent = bondPrice.toLocaleString() + ' gp';
        document.getElementById('bondCard').style.display = 'block';
        
        loadBondCardData();
        
        document.getElementById('loading').style.display = 'none';
        document.getElementById('itemsTable').style.display = 'table';
        
        renderItems();
    } catch (err) {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('error').style.display = 'block';
        document.getElementById('error').textContent = 'Failed to load prices: ' + err.message;
    }
}

function gpToLocal(gp, currency) {
    return gp * (BOND_REAL_PRICES[currency].price / bondPrice);
}

let bondMiniChart = null;
let bondHistoryCache = null;

async function loadBondCardData() {
    try {
        const response = await fetch('https://api.weirdgloop.org/exchange/history/rs/all?name=Bond');
        const data = await response.json();
        bondHistoryCache = data['Bond'] || [];
        updateBondCardDisplay();
    } catch (e) {
        document.getElementById('bondDailyChange').textContent = 'N/A';
    }
}

function updateBondCardDisplay() {
    if (!bondHistoryCache || bondHistoryCache.length < 2) return;
    
    const periodValue = getPeriodPreference();
    let history;
    let periodLabel;
    
    if (periodValue === 'all') {
        history = bondHistoryCache;
        periodLabel = 'All-Time';
    } else {
        const days = parseInt(periodValue);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        history = bondHistoryCache.filter(d => new Date(d.timestamp) >= cutoffDate);
        if (history.length === 0) history = bondHistoryCache.slice(-1);
        periodLabel = `${days}-Day`;
    }
    
    const currentPrice = history[history.length - 1].price;
    const firstPrice = history[0].price;
    const change = ((currentPrice - firstPrice) / firstPrice * 100).toFixed(1);
    
    const dailyChangeEl = document.getElementById('bondDailyChange');
    dailyChangeEl.textContent = change + '%';
    dailyChangeEl.style.color = change >= 0 ? '#4CAF50' : '#ff6b6b';
    document.getElementById('bondChangeLabel').textContent = periodLabel;
    
    const labels = history.map(d => {
        const date = new Date(d.timestamp);
        return date.toLocaleDateString('en-CA', { month: 'short', year: '2-digit' });
    });
    const prices = history.map(d => d.price);
    
    if (bondMiniChart) bondMiniChart.destroy();
    
    const ctx = document.getElementById('bondMiniChart').getContext('2d');
    bondMiniChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                data: prices,
                borderColor: '#f0b90b',
                backgroundColor: 'rgba(240, 185, 11, 0.1)',
                fill: true,
                tension: 0.1,
                pointRadius: 0,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { display: false },
                tooltip: {
                    displayColors: false,
                    callbacks: {
                        label: (ctx) => ctx.raw.toLocaleString() + ' gp'
                    }
                }
            },
            scales: {
                x: { display: false },
                y: { display: false }
            }
        }
    });
    
    updateBondLocalPrice();
}

function updateBondLocalPrice() {
    const currency = document.getElementById('currency').value;
    const currencyInfo = BOND_REAL_PRICES[currency];
    document.getElementById('bondLocalPrice').textContent = currencyInfo.symbol + currencyInfo.price.toFixed(2);
    const gpPerUnit = Math.round(bondPrice / currencyInfo.price);
    document.getElementById('bondGpPerUnit').textContent = gpPerUnit.toLocaleString();
    document.getElementById('bondCurrencySymbol').textContent = currencyInfo.symbol;
}

function formatGP(gp) {
    return gp.toLocaleString() + ' gp';
}

const itemMultipliers = {};

function parseMultiplier(str) {
    if (!str) return null;
    str = str.trim().toLowerCase();
    if (!str) return null;
    
    const multipliers = { 'k': 1000, 'm': 1000000, 'b': 1000000000 };
    const lastChar = str.slice(-1);
    
    if (multipliers[lastChar]) {
        const num = parseFloat(str.slice(0, -1));
        return isNaN(num) ? null : num * multipliers[lastChar];
    }
    
    const num = parseFloat(str);
    return isNaN(num) || num <= 0 ? null : num;
}

function needsMultiplier(amount) {
    return amount > 0 && amount < 0.10;
}

function getDefaultMultiplier(amount) {
    if (amount <= 0 || amount >= 0.10) return null;
    return Math.pow(10, Math.ceil(Math.log10(0.10 / amount)));
}

function formatLocal(amount, currency, multiplier = null) {
    const info = BOND_REAL_PRICES[currency];
    const displayAmount = multiplier ? amount * multiplier : amount;
    return info.symbol + displayAmount.toLocaleString(undefined, { 
        minimumFractionDigits: 2,
        maximumFractionDigits: 2 
    });
}

function getFilteredAndSortedItems() {
    const search = document.getElementById('search').value.toLowerCase();
    const currency = document.getElementById('currency').value;
    
    let filtered = allItems.filter(item => 
        item.name.toLowerCase().includes(search)
    );
    
    filtered = filtered.map(item => ({
        ...item,
        local: gpToLocal(item.gp, currency)
    }));
    
    if (sortBy === 'volume') {
        filtered.sort((a, b) => {
            const volA = a.volume || 0;
            const volB = b.volume || 0;
            return sortDirection === 'desc' ? volB - volA : volA - volB;
        });
    } else {
        filtered.sort((a, b) => sortDirection === 'desc' ? b.gp - a.gp : a.gp - b.gp);
    }
    
    return filtered;
}

function renderItems() {
    const currency = document.getElementById('currency').value;
    const items = getFilteredAndSortedItems();
    
    const sortNames = { 'volume': 'Volume', 'gp': 'Price' };
    const arrow = sortDirection === 'desc' ? '↓' : '↑';
    document.getElementById('sortLabel').textContent = `${sortNames[sortBy]} ${arrow}`;
    
    const currencyInfo = BOND_REAL_PRICES[currency];
    document.getElementById('currencyLabel').textContent = `${currency} ${currencyInfo.symbol}`;
    
    const totalPages = Math.ceil(items.length / pageSize);
    if (currentPage > totalPages) currentPage = Math.max(1, totalPages);
    
    const start = (currentPage - 1) * pageSize;
    const pageItems = items.slice(start, start + pageSize);
    
    const tbody = document.getElementById('itemsBody');
    tbody.innerHTML = pageItems.map(item => {
        const imgSrc = itemImages[item.name];
        const imgHtml = imgSrc ? `<img src="${imgSrc}" alt="${item.name}" class="item-thumb" onerror="this.style.display='none'">` : '<span class="item-thumb"></span>';
        const showMultiplier = needsMultiplier(item.local);
        const multiplier = itemMultipliers[item.name] || null;
        const defaultMult = getDefaultMultiplier(item.local);
        const displayMultiplier = multiplier || (showMultiplier ? defaultMult : null);
        const priceDisplay = formatLocal(item.local, currency, displayMultiplier);
        const perText = displayMultiplier ? ` <span class="per-wrapper"><span class="per-label">per</span> <span class="per-value multiplier-trigger" data-item="${item.name.replace(/"/g, '&quot;')}" title="Click to change quantity">${displayMultiplier.toLocaleString()}</span></span>` : '';
        return `
        <tr class="item-row" data-name="${item.name.replace(/"/g, '&quot;')}" data-volume="${item.volume ?? ''}">
            <td><div class="item-name-cell">${imgHtml}${item.name}</div></td>
            <td class="gp">${formatGP(item.gp)}</td>
            <td class="local-currency">${priceDisplay}${perText}</td>
        </tr>
    `}).join('');
    
    document.querySelectorAll('.multiplier-trigger').forEach(perValue => {
        perValue.addEventListener('click', (e) => {
            e.stopPropagation();
            const itemName = perValue.dataset.item;
            const currentVal = itemMultipliers[itemName] || '';
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'multiplier-input';
            input.value = currentVal;
            input.placeholder = '1k';
            input.style.cssText = 'width:35px;max-width:35px;min-width:35px;font-size:11px;padding:0 1px;border:none;border-radius:3px;background:transparent;color:#4CAF50;font-weight:normal;text-align:center;outline:none;display:inline-block;box-sizing:border-box;';
            
            perValue.replaceWith(input);
            input.focus();
            input.select();
            
            const applyMultiplier = () => {
                const val = parseMultiplier(input.value);
                if (val) {
                    itemMultipliers[itemName] = val;
                } else {
                    delete itemMultipliers[itemName];
                }
                renderItems();
            };
            
            input.addEventListener('blur', applyMultiplier);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    applyMultiplier();
                }
                if (e.key === 'Escape') {
                    renderItems();
                }
            });
        });
    });
    
    document.querySelectorAll('.item-row').forEach(row => {
        const vol = row.dataset.volume;
        const volumeNum = vol !== '' ? parseInt(vol) : null;
        row.addEventListener('click', () => openModal(row.dataset.name, volumeNum));
    });
    
    const pagination = document.getElementById('pagination');
    if (items.length > pageSize) {
        pagination.style.display = 'flex';
        document.getElementById('prevPage').disabled = currentPage === 1;
        document.getElementById('nextPage').disabled = currentPage === totalPages;
        document.getElementById('pageInfo').textContent = `Page ${currentPage} of ${totalPages}`;
    } else {
        pagination.style.display = 'none';
    }
}

document.getElementById('prevPage').addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        renderItems();
    }
});

document.getElementById('nextPage').addEventListener('click', () => {
    const items = getFilteredAndSortedItems();
    const totalPages = Math.ceil(items.length / pageSize);
    if (currentPage < totalPages) {
        currentPage++;
        renderItems();
    }
});

let priceChart = null;
const historyCache = {};
let bondHistoryMap = null;
let currentModalItem = null;
let currentModalVolume = null;

function getPeriodPreference() {
    return sessionStorage.getItem('gme_period') || 'all';
}

function setPeriodPreference(period) {
    sessionStorage.setItem('gme_period', period);
}

function updatePeriodSelectorUI() {
    const period = getPeriodPreference();
    document.querySelectorAll('.period-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.period === period);
    });
}

async function getBondHistoryMap() {
    if (bondHistoryMap) return bondHistoryMap;
    
    try {
        const response = await fetch('https://api.weirdgloop.org/exchange/history/rs/all?name=Bond');
        const data = await response.json();
        const bondHistory = data['Bond'] || [];
        bondHistoryMap = new Map(bondHistory.map(d => [d.timestamp, d.price]));
        return bondHistoryMap;
    } catch (e) {
        return null;
    }
}

function gpToLocalHistorical(gp, currency, bondPriceAtTime) {
    const bondPriceToUse = bondPriceAtTime || bondPrice;
    return gp * (BOND_REAL_PRICES[currency].price / bondPriceToUse);
}

async function openModal(itemName, volume) {
    const modal = document.getElementById('modal');
    const title = document.getElementById('modalTitle');
    const content = document.getElementById('modalContent');
    
    updatePeriodSelectorUI();
    
    currentModalItem = itemName;
    currentModalVolume = volume;
    
    const imgHtml = itemImages[itemName] ? `<img src="${itemImages[itemName]}" alt="${itemName}" onerror="this.style.display='none'">` : '';
    title.innerHTML = `${imgHtml}${itemName}`;
    content.innerHTML = '<div class="modal-loading">Loading price history...</div>';
    modal.classList.add('active');
    
    try {
        const [itemResult, bondMap] = await Promise.all([
            (async () => {
                if (historyCache[itemName]) return historyCache[itemName];
                const response = await fetch(`https://api.weirdgloop.org/exchange/history/rs/all?name=${encodeURIComponent(itemName)}`);
                const data = await response.json();
                const history = data[itemName] || [];
                historyCache[itemName] = history;
                return history;
            })(),
            getBondHistoryMap()
        ]);
        
        const fullHistoryData = itemResult;
        
        if (fullHistoryData.length === 0) {
            content.innerHTML = '<div class="modal-loading">No historical data available</div>';
            return;
        }
        
        const periodValue = getPeriodPreference();
        let historyData;
        let periodLabel;
        
        if (periodValue === 'all') {
            historyData = fullHistoryData;
            periodLabel = 'All-Time';
        } else {
            const days = parseInt(periodValue);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            historyData = fullHistoryData.filter(d => new Date(d.timestamp) >= cutoffDate);
            if (historyData.length === 0) {
                historyData = fullHistoryData.slice(-1);
            }
            periodLabel = `${days}-Day`;
        }
        
        const currency = document.getElementById('currency').value;
        const currencyInfo = BOND_REAL_PRICES[currency];
        
        const labels = historyData.map(d => {
            const date = new Date(d.timestamp);
            return date.toLocaleDateString('en-CA', { month: 'short', year: '2-digit' });
        });
        const prices = itemName === 'Bond' 
            ? historyData.map(() => currencyInfo.price)
            : historyData.map(d => {
                const bondPriceAtTime = bondMap ? bondMap.get(d.timestamp) : null;
                return gpToLocalHistorical(d.price, currency, bondPriceAtTime);
            });
        
        const currentPrice = prices[prices.length - 1];
        const firstPrice = prices[0];
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const change = ((currentPrice - firstPrice) / firstPrice * 100).toFixed(1);
        const showMultiplier = needsMultiplier(currentPrice);
        const multiplier = itemMultipliers[itemName] || null;
        const defaultMult = getDefaultMultiplier(currentPrice);
        const displayMultiplier = multiplier || (showMultiplier ? defaultMult : null);
        const perText = displayMultiplier ? ` <span class="per-wrapper"><span class="per-label">per</span> <span class="per-value multiplier-modal-trigger" title="Click to change quantity">${displayMultiplier.toLocaleString()}</span></span>` : '';
        
        title.innerHTML = `${imgHtml}${itemName}${perText}`;
        
        content.innerHTML = `
            <div class="modal-content-grid">
                <div class="modal-chart-wrapper">
                    <div class="chart-container">
                        <canvas id="priceChart"></canvas>
                    </div>
                    <div class="modal-stats">
                <div class="modal-stat">
                    <div class="modal-stat-label">Current</div>
                    <div class="modal-stat-value">${formatLocal(currentPrice, currency, displayMultiplier)}</div>
                </div>
                <div class="modal-stat">
                    <div class="modal-stat-label">${periodLabel} High</div>
                    <div class="modal-stat-value">${formatLocal(maxPrice, currency, displayMultiplier)}</div>
                </div>
                <div class="modal-stat">
                    <div class="modal-stat-label">${periodLabel} Low</div>
                    <div class="modal-stat-value">${formatLocal(minPrice, currency, displayMultiplier)}</div>
                </div>
                <div class="modal-stat">
                    <div class="modal-stat-label">${periodLabel} Change</div>
                    <div class="modal-stat-value" style="color: ${change >= 0 ? '#4CAF50' : '#ff6b6b'}">${change}%</div>
                </div>
                <div class="modal-stat">
                    <div class="modal-stat-label">Daily Volume</div>
                    <div class="modal-stat-value">${volume != null ? volume.toLocaleString() : 'Unknown'}</div>
                </div>
                <div class="modal-stat">
                    <div class="modal-stat-label">Data Points</div>
                    <div class="modal-stat-value">${historyData.length.toLocaleString()}</div>
                </div>
                    </div>
                </div>
            </div>
        `;
        
        const displayPrices = displayMultiplier ? prices.map(p => p * displayMultiplier) : prices;
        
        if (priceChart) priceChart.destroy();
        
        const ctx = document.getElementById('priceChart').getContext('2d');
        priceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: `Price (${currencyInfo.symbol}${displayMultiplier ? ' per ' + displayMultiplier.toLocaleString() : ''})`,
                    data: displayPrices,
                    borderColor: '#f0b90b',
                    backgroundColor: 'rgba(240, 185, 11, 0.1)',
                    fill: true,
                    tension: 0.1,
                    pointRadius: 0,
                    pointHoverRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        displayColors: false,
                        callbacks: {
                            label: (ctx) => formatLocal(ctx.raw, currency)
                        }
                    }
                },
                scales: {
                    x: { 
                        grid: { color: '#3d3d54' },
                        ticks: { 
                            color: '#888',
                            maxTicksLimit: 12
                        }
                    },
                    y: { 
                        grid: { color: '#3d3d54' },
                        ticks: { 
                            color: '#888',
                            callback: (v) => formatLocal(v, currency)
                        }
                    }
                }
            }
        });
        
        const modalPerValue = content.querySelector('.multiplier-modal-trigger');
        if (modalPerValue) {
            modalPerValue.addEventListener('click', (e) => {
                e.stopPropagation();
                const currentVal = itemMultipliers[itemName] || '';
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'multiplier-input';
                input.value = currentVal;
                input.placeholder = '1k';
                input.style.cssText = 'width:35px;max-width:35px;min-width:35px;font-size:11px;padding:0 1px;border:none;border-radius:3px;background:transparent;color:#4CAF50;font-weight:normal;text-align:center;outline:none;display:inline-block;box-sizing:border-box;';
                
                modalPerValue.replaceWith(input);
                input.focus();
                input.select();
                
                const applyMultiplier = () => {
                    const val = parseMultiplier(input.value);
                    if (val) {
                        itemMultipliers[itemName] = val;
                    } else {
                        delete itemMultipliers[itemName];
                    }
                    openModal(itemName, volume);
                };
                
                input.addEventListener('blur', applyMultiplier);
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        applyMultiplier();
                    }
                    if (e.key === 'Escape') {
                        openModal(itemName, volume);
                    }
                });
            });
        }
    } catch (err) {
        content.innerHTML = `<div class="modal-loading">Failed to load history: ${err.message}</div>`;
    }
}

document.getElementById('modalClose').addEventListener('click', () => {
    document.getElementById('modal').classList.remove('active');
});
document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') {
        document.getElementById('modal').classList.remove('active');
    }
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.getElementById('modal').classList.remove('active');
    }
});

document.querySelectorAll('#periodSelector .period-option').forEach(opt => {
    opt.addEventListener('click', () => {
        setPeriodPreference(opt.dataset.period);
        updatePeriodSelectorUI();
        if (currentModalItem) {
            openModal(currentModalItem, currentModalVolume);
        }
    });
});

document.querySelectorAll('#bondPeriodSelector .period-option').forEach(opt => {
    opt.addEventListener('click', () => {
        setPeriodPreference(opt.dataset.period);
        updateBondPeriodSelectorUI();
        updateBondCardDisplay();
    });
});

function updateBondPeriodSelectorUI() {
    const period = getPeriodPreference();
    document.querySelectorAll('#bondPeriodSelector .period-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.period === period);
    });
}

if (localStorage.getItem('gme_currency')) {
    document.getElementById('currency').value = localStorage.getItem('gme_currency');
}
if (localStorage.getItem('gme_sortBy')) {
    sortBy = localStorage.getItem('gme_sortBy');
}
if (localStorage.getItem('gme_sortDir')) {
    sortDirection = localStorage.getItem('gme_sortDir');
}

document.getElementById('search').addEventListener('input', () => {
    currentPage = 1;
    renderItems();
});
document.getElementById('currency').addEventListener('change', () => {
    localStorage.setItem('gme_currency', document.getElementById('currency').value);
    renderItems();
    updateBondLocalPrice();
    const modal = document.getElementById('modal');
    const title = document.getElementById('modalTitle');
    if (modal.classList.contains('active')) {
        const item = allItems.find(i => i.name === title.textContent);
        openModal(title.textContent, item ? item.volume : 0);
    }
});

document.getElementById('currencyToggle').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('currencyDropdown').classList.toggle('active');
    document.getElementById('sortDropdown').classList.remove('active');
});

document.querySelectorAll('#currencyDropdown div').forEach(option => {
    option.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('currency').value = option.dataset.currency;
        localStorage.setItem('gme_currency', option.dataset.currency);
        document.getElementById('currencyDropdown').classList.remove('active');
        renderItems();
        updateBondLocalPrice();
        const modal = document.getElementById('modal');
        const title = document.getElementById('modalTitle');
        if (modal.classList.contains('active')) {
            const item = allItems.find(i => i.name === title.textContent);
            openModal(title.textContent, item ? item.volume : 0);
        }
    });
});

document.getElementById('sortToggle').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('sortDropdown').classList.toggle('active');
    document.getElementById('currencyDropdown').classList.remove('active');
});

document.querySelectorAll('#sortDropdown div').forEach(option => {
    option.addEventListener('click', (e) => {
        e.stopPropagation();
        sortBy = option.dataset.sort;
        sortDirection = option.dataset.dir;
        localStorage.setItem('gme_sortBy', sortBy);
        localStorage.setItem('gme_sortDir', sortDirection);
        document.getElementById('sortDropdown').classList.remove('active');
        currentPage = 1;
        renderItems();
    });
});

document.addEventListener('click', (e) => {
    document.getElementById('sortDropdown').classList.remove('active');
    document.getElementById('currencyDropdown').classList.remove('active');
});

updateBondPeriodSelectorUI();
loadImages().then(() => loadData());

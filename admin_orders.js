const orders = document.getElementById('orders');
const toggleViewBtn = document.getElementById('toggleView');
const drawer = document.getElementById('drawer');
const closeDrawer = document.getElementById('closeDrawer');
const orderInfo = document.getElementById('orderInfo');
const batchBar = document.getElementById('batchBar');
const selectedCount = document.getElementById('selectedCount');
const toast = document.getElementById('toast');

// toggle card/table view
toggleViewBtn?.addEventListener('click', () => {
    if (orders.classList.contains('cards')) {
        renderTable();
        orders.classList.remove('cards');
        orders.classList.add('table');
        toggleViewBtn.textContent = 'Card View';
    } else {
        renderCards();
        orders.classList.remove('table');
        orders.classList.add('cards');
        toggleViewBtn.textContent = 'Table View';
    }
});

function renderTable() {
    const rows = [...document.querySelectorAll('.order-card')].map(card => {
        const id = card.dataset.id;
        const info = card.querySelector('p').textContent;
        return `<tr><td><input type="checkbox" class="select" data-id="${id}"></td><td>${card.querySelector('h3').textContent}</td><td>${info}</td><td><button class="details" data-id="${id}">Details</button></td></tr>`;
    }).join('');
    orders.innerHTML = `<table><thead><tr><th></th><th>Order</th><th>Info</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}
function renderCards() {
    orders.innerHTML = `
    <article class="order-card" data-id="1">
        <input type="checkbox" class="select" />
        <h3>Order #1001</h3>
        <p>Table 5 · Pending</p>
        <button class="details">Details</button>
    </article>
    <article class="order-card" data-id="2">
        <input type="checkbox" class="select" />
        <h3>Order #1002</h3>
        <p>Table 2 · Completed</p>
        <button class="details">Details</button>
    </article>
    <article class="order-card" data-id="3">
        <input type="checkbox" class="select" />
        <h3>Order #1003</h3>
        <p>Takeaway · Pending</p>
        <button class="details">Details</button>
    </article>`;
}

// drawer logic
orders.addEventListener('click', e => {
    if (e.target.classList.contains('details')) {
        const card = e.target.closest('[data-id]');
        orderInfo.textContent = `Details for order ${card.dataset.id}`;
        drawer.classList.add('visible');
    }
    if (e.target.classList.contains('select')) updateBatchBar();
});

document.body.addEventListener('change', e => {
    if (e.target.classList.contains('select')) updateBatchBar();
});

closeDrawer?.addEventListener('click', () => {
    drawer.classList.remove('visible');
});

// batch bar
function updateBatchBar() {
    const selected = document.querySelectorAll('.select:checked').length;
    if (selected > 0) {
        batchBar.classList.remove('hidden');
        selectedCount.textContent = `${selected} selected`;
    } else {
        batchBar.classList.add('hidden');
    }
}

// toast helper
function showToast(message) {
    toast.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2000);
}

document.getElementById('batchMark')?.addEventListener('click', () => {
    showToast('Marked as completed');
});

document.getElementById('batchExport')?.addEventListener('click', () => {
    showToast('Exported');
});

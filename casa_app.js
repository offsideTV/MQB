import { 
    collection, addDoc, onSnapshot, query, doc, 
    deleteDoc, updateDoc, writeBatch, orderBy, setDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- SEGURIDAD ---
onAuthStateChanged(window.auth, (user) => { if (!user) window.location.href = "login.html"; });

let boletas = [], historial = [], configCasa = { sueldo: 0 };

// --- UTILIDADES (Copiadas del Local para consistencia) ---
function getFechaOperativa() { return new Date().toISOString().split('T')[0]; }
function formatDateForDisplay(iso) { 
    if(!iso) return ''; 
    const [y,m,d] = iso.split('-'); 
    return `${d}/${m}/${y}`; 
}

function showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast-msg bg-slate-900 text-white px-6 py-3 rounded-lg shadow-2xl flex items-center gap-3 border-l-4 border-blue-500';
    toast.innerHTML = `<i class="fas fa-info-circle text-blue-400"></i> <span class="text-sm font-bold">${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = '0.5s';
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}

function customConfirm({ title, text, okText = 'Confirmar', type = 'blue' }) {
    return new Promise((resolve) => {
        const modal = document.getElementById('modal-confirm');
        const content = document.getElementById('confirm-content');
        const titleEl = document.getElementById('confirm-title');
        const textEl = document.getElementById('confirm-text');
        const btnOk = document.getElementById('btn-confirm-ok');
        const btnCancel = document.getElementById('btn-confirm-cancel');
        const iconEl = document.getElementById('confirm-icon');

        titleEl.innerText = title; textEl.innerText = text; btnOk.innerText = okText;
        
        if(type === 'red') {
            btnOk.className = "flex-1 py-3 px-4 rounded-lg font-bold text-white bg-red-500 hover:bg-red-600 transition";
            iconEl.innerHTML = '<i class="fas fa-trash-alt text-2xl text-red-600"></i>';
            iconEl.className = "w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-red-50";
        } else {
            btnOk.className = "flex-1 py-3 px-4 rounded-lg font-bold text-white bg-blue-600 hover:bg-blue-700 transition";
            iconEl.innerHTML = '<i class="fas fa-question text-2xl text-blue-600"></i>';
            iconEl.className = "w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-blue-50";
        }

        modal.classList.remove('hidden');
        setTimeout(() => content.classList.add('confirm-animate'), 10);

        function close(res) {
            content.classList.remove('confirm-animate');
            setTimeout(() => { modal.classList.add('hidden'); resolve(res); }, 200);
        }
        btnOk.onclick = () => close(true);
        btnCancel.onclick = () => close(false);
    });
}

// --- ESCUCHAS ---
function setupListeners() {
    onSnapshot(collection(window.db, "casa_boletas"), (s) => {
        boletas = s.docs.map(d => ({id: d.id, ...d.data()}));
        updateBoletasTable();
        updateDashboard();
    });

    onSnapshot(doc(window.db, "casa_config", "presupuesto"), (d) => {
        if (d.exists()) {
            configCasa = d.data();
            document.getElementById('display-sueldo').innerText = `$${configCasa.sueldo.toLocaleString('es-AR')}`;
            updateDashboard();
        }
    });

    onSnapshot(query(collection(window.db, "casa_historial"), orderBy("fechaCierre", "desc")), (s) => {
        historial = s.docs.map(d => ({id: d.id, ...d.data()}));
        updateHistorialTable();
    });
}

// --- DASHBOARD (SISTEMA DE AVISOS ADAPTADO) ---
function updateDashboard() {
    const hoyF = getFechaOperativa();
    let stats = { pagado: 0, pendiente: 0, vencidas: 0, porVencer: 0 };
    let avisos = [];

    boletas.forEach(b => {
        const diff = Math.ceil((new Date(b.vencimiento) - new Date(hoyF)) / 86400000);
        if(b.pagado) {
            stats.pagado += b.monto;
        } else {
            stats.pendiente += b.monto;
            if(diff < 0) {
                stats.vencidas++;
            } else if(diff <= 7) {
                stats.porVencer++;
                avisos.push({ detalle: b.detalle, dias: diff, monto: b.monto });
            }
        }
    });

    const disponible = configCasa.sueldo - stats.pagado - stats.pendiente;

    const kpi = document.getElementById('kpi-cards');
    if(kpi) kpi.innerHTML = `
        <div class="bg-white p-6 rounded-xl shadow-sm border-l-4 border-red-500"><p class="text-slate-400 text-[10px] font-black uppercase">Vencidas</p><h3 class="text-2xl font-bold text-red-600">${stats.vencidas}</h3></div>
        <div class="bg-white p-6 rounded-xl shadow-sm border-l-4 border-yellow-500"><p class="text-slate-400 text-[10px] font-black uppercase">Próximos (7d)</p><h3 class="text-2xl font-bold text-yellow-600">${stats.porVencer}</h3></div>
        <div class="bg-white p-6 rounded-xl shadow-sm border-l-4 border-green-500"><p class="text-slate-400 text-[10px] font-black uppercase">Pagado Mes</p><h3 class="text-2xl font-bold text-green-600">$${stats.pagado.toLocaleString('es-AR')}</h3></div>
        <div class="bg-slate-900 p-6 rounded-xl shadow-lg border-l-4 border-blue-500 text-white"><p class="text-blue-400 text-[10px] font-black uppercase">Saldo Disponible</p><h3 class="text-2xl font-bold">$${disponible.toLocaleString('es-AR')}</h3></div>
    `;

    const statusEl = document.getElementById('status-message');
    if(statusEl) {
        if(avisos.length > 0) {
            avisos.sort((a,b) => a.dias - b.dias);
            statusEl.innerHTML = `<div class="space-y-2">${avisos.map(a => `
                <div class="flex justify-between items-center bg-slate-50 p-2 rounded border-l-2 border-yellow-400 text-xs">
                    <div><span class="font-bold text-slate-700">${a.detalle}</span><br><span class="text-slate-400">$${a.monto.toLocaleString('es-AR')}</span></div>
                    <span class="bg-yellow-100 text-yellow-700 px-2 py-1 rounded font-black uppercase">Faltan ${a.dias}d</span>
                </div>`).join('')}</div>`;
        } else {
            statusEl.innerHTML = `<p class="text-center text-slate-400 text-sm py-2">No hay vencimientos próximos.</p>`;
        }
    }
}

// --- ACCIONES GASTOS ---
document.getElementById('form-boleta-casa').onsubmit = async (e) => {
    e.preventDefault();
    await addDoc(collection(window.db, "casa_boletas"), {
        tipo: document.getElementById('b-tipo').value,
        detalle: document.getElementById('b-detalle').value,
        monto: parseFloat(document.getElementById('b-monto').value),
        vencimiento: document.getElementById('b-vencimiento').value,
        pagado: false,
        fechaRegistro: new Date().toISOString()
    });
    window.closeModal('modal-boleta');
    e.target.reset();
    showToast("Gasto personal guardado");
};

window.pagarCasa = async (id) => {
    const b = boletas.find(x => x.id === id);
    if(await customConfirm({ title: 'Confirmar Pago', text: `¿Marcar como pagado el gasto de $${b.monto.toLocaleString('es-AR')}?` })) {
        await updateDoc(doc(window.db, "casa_boletas", id), { pagado: true });
        showToast("Pago registrado");
    }
};

window.eliminarGastoCasa = async (id) => {
    if(await customConfirm({ title: 'Eliminar Gasto', text: '¿Borrar este registro para siempre?', type: 'red' })) {
        await deleteDoc(doc(window.db, "casa_boletas", id));
        showToast("Gasto eliminado");
    }
};

// --- PRESUPUESTO ---
document.getElementById('form-sueldo').onsubmit = async (e) => {
    e.preventDefault();
    const monto = parseFloat(document.getElementById('input-sueldo-valor').value);
    await setDoc(doc(window.db, "casa_config", "presupuesto"), { sueldo: monto });
    window.closeModal('modal-sueldo');
    showToast("Presupuesto mensual actualizado");
};

// --- HISTORIAL ---
window.confirmarFinalizarMesCasa = async () => {
    if(await customConfirm({ title: 'Finalizar Mes', text: 'Se archivarán los gastos pagados y se limpiará la tabla actual.' })) {
        const batch = writeBatch(window.db);
        const periodo = new Date().toLocaleString('es-AR', { month: 'long', year: 'numeric' });
        const total = boletas.filter(b => b.pagado).reduce((acc, b) => acc + b.monto, 0);
        
        batch.set(doc(collection(window.db, "casa_historial")), { 
            periodo, totalGastos: total, ingreso: configCasa.sueldo, fechaCierre: new Date().toISOString() 
        });
        boletas.filter(b => b.pagado).forEach(b => batch.delete(doc(window.db, "casa_boletas", b.id)));
        await batch.commit();
        showToast("Mes archivado con éxito");
    }
};

window.borrarHistorialCompletoCasa = async () => {
    if(await customConfirm({ title: 'Limpiar Historial', text: '¿Deseas eliminar todos los resúmenes archivados?', type: 'red' })) {
        const batch = writeBatch(window.db);
        historial.forEach(h => batch.delete(doc(window.db, "casa_historial", h.id)));
        await batch.commit();
        showToast("Historial vaciado");
    }
};

// --- NAVEGACIÓN Y TABLAS ---
function updateBoletasTable() {
    const table = document.getElementById('table-boletas-casa');
    if(!table) return;
    table.innerHTML = boletas.map(b => `
        <tr class="hover:bg-slate-50 border-b transition">
            <td class="p-4 font-bold text-xs text-slate-400 uppercase">${b.tipo}</td>
            <td class="p-4 text-slate-700 font-medium">${b.detalle}</td>
            <td class="p-4">${formatDateForDisplay(b.vencimiento)}</td>
            <td class="p-4 font-bold text-blue-600">$${b.monto.toLocaleString('es-AR')}</td>
            <td class="p-4"><span class="px-2 py-1 rounded text-[10px] font-black ${b.pagado ? 'bg-green-100 text-green-700':'bg-yellow-100 text-yellow-700'}">${b.pagado ? 'PAGADO':'PENDIENTE'}</span></td>
            <td class="p-4 text-right">
                ${!b.pagado ? `<button onclick="pagarCasa('${b.id}')" class="text-blue-600 font-bold mr-4 underline text-xs">Pagar</button>` : '<i class="fas fa-check-circle text-green-500 mr-4"></i>'}
                <button onclick="eliminarGastoCasa('${b.id}')" class="text-slate-300 hover:text-red-500"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`).join('') || '<tr><td colspan="6" class="p-12 text-center text-slate-300 italic">No hay gastos este mes.</td></tr>';
}

function updateHistorialTable() {
    const t = document.getElementById('table-historial-casa');
    if(!t) return;
    t.innerHTML = historial.map(h => `
        <tr class="border-b text-sm">
            <td class="p-4 font-bold capitalize text-slate-700">${h.periodo}</td>
            <td class="p-4 text-red-600 font-bold">$${h.totalGastos.toLocaleString('es-AR')}</td>
            <td class="p-4 text-green-600 font-bold">$${(h.ingreso || 0).toLocaleString('es-AR')}</td>
            <td class="p-4 text-right"><span class="text-[10px] bg-slate-100 px-3 py-1 rounded-full font-black text-slate-400 uppercase">Archivado</span></td>
        </tr>`).join('');
}

window.showSection = (id) => {
    document.querySelectorAll('main section').forEach(s => s.classList.add('hidden'));
    document.getElementById('sec-' + id).classList.remove('hidden');
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active-link'));
    if(event) event.currentTarget.classList.add('active-link');
    const titles = { 'dashboard': 'Dashboard Personal', 'boletas': 'Mis Gastos', 'sueldo': 'Presupuesto', 'historial': 'Historial Personal' };
    document.getElementById('section-title').innerText = titles[id] || "Casa";
};

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('current-date').innerText = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    setupListeners();
});

window.openModal = (id) => document.getElementById(id).classList.remove('hidden');
window.closeModal = (id) => document.getElementById(id).classList.add('hidden');
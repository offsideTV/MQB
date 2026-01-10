import { 
    collection, addDoc, onSnapshot, query, where, 
    doc, deleteDoc, updateDoc, getDocs, writeBatch, orderBy 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

onAuthStateChanged(window.auth, (user) => {
    if (!user) {
        window.location.href = "login.html";
    }
});
// --- ESTADO LOCAL PARA RENDEREADO ---
let boletas = [];
let historial = [];
let empleados = [];
let proveedores = [];
let ventasDiarias = [];
let currentFilter = 'todos';

// --- UTILIDADES DE FECHA ---
function getFechaOperativa() {
    const ahora = new Date();
    if (ahora.getHours() < 4) {
        ahora.setDate(ahora.getDate() - 1);
    }
    const y = ahora.getFullYear();
    const m = String(ahora.getMonth() + 1).padStart(2, '0');
    const d = String(ahora.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function formatDateForDisplay(isoDate) { // isoDate → "2026-01-08"
    if (!isoDate) return '';
    const [y, m, d] = isoDate.split('-');
    return `${d} - ${m} - ${y}`;
}

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    // Fecha actual formateada para visualización
    const today = new Date();
    document.getElementById('current-date').innerText = today.toLocaleDateString('es-AR', { 
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
    });

    // Iniciar escuchas en tiempo real
    setupListeners();

    const btnCerrar = document.getElementById('btn-cerrar-caja');
    if (btnCerrar) btnCerrar.onclick = handleCerrarCaja;
});

// --- ESCUCHAS EN TIEMPO REAL (FIRESTORE) ---
function setupListeners() {
    onSnapshot(collection(window.db, "empleados"), (snapshot) => {
        empleados = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateEmpleadosTable();
    });

    onSnapshot(collection(window.db, "proveedores"), (snapshot) => {
        proveedores = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateProveedoresGrid();
    });

    onSnapshot(collection(window.db, "boletas"), (snapshot) => {
        boletas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateBoletasTable();
        updateDashboard();
    });

    onSnapshot(collection(window.db, "ventas"), (snapshot) => {
        ventasDiarias = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateVentasUI();
    });

    onSnapshot(query(collection(window.db, "historial"), orderBy("fechaCierre", "desc")), (snapshot) => {
        historial = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateHistorialTable();
    });
}

// --- UTILIDADES UI ---
function showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast-msg bg-slate-900 text-white px-6 py-3 rounded-lg shadow-2xl flex items-center gap-3 border-l-4 border-green-500';
    toast.innerHTML = `<i class="fas fa-check-circle text-green-500"></i> <span class="text-sm font-bold">${message}</span>`;
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

        titleEl.innerText = title; 
        textEl.innerText = text; 
        btnOk.innerText = okText;
        
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

// --- NAVEGACIÓN ---
window.showSection = function(sectionId) {
    document.querySelectorAll('main section').forEach(s => s.classList.add('hidden'));
    const target = document.getElementById('sec-' + sectionId);
    if(target) target.classList.remove('hidden');

    const titles = { 
        'dashboard': 'Dashboard', 'boletas': 'Gastos del mes', 
        'empleados': 'Personal', 'proveedores': 'Proveedores', 
        'historial': 'Historial', 'ventas': 'Ventas diarias' 
    };
    document.getElementById('section-title').innerText = titles[sectionId] || "Sección";
    
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active-link'));
    const btns = document.querySelectorAll('.nav-btn');
    btns.forEach(btn => {
        if(btn.getAttribute('onclick')?.includes(`'${sectionId}'`)) btn.classList.add('active-link');
    });
};

window.logout = async function() {
    if(await customConfirm({ title: 'Cerrar sesión', text: '¿Deseas salir del sistema?', okText: 'Salir' })) {
        await signOut(window.auth);
    }
};

window.openModal = function(id) { 
    document.getElementById(id).classList.remove('hidden'); 
    if(id === 'modal-boleta') {
        const selectProv = document.getElementById('b-proveedor');
        selectProv.innerHTML = '<option value="">Seleccionar Proveedor...</option><option value="Particular">Particular</option>';
        proveedores.forEach(p => {
            const opt = document.createElement('option'); 
            opt.value = p.nombre; 
            opt.textContent = p.nombre; 
            selectProv.appendChild(opt);
        });
    }
};
window.closeModal = function(id) { 
    document.getElementById(id).classList.add('hidden'); 
};

// --- GESTIÓN DE PERSONAL ---
document.getElementById('form-empleado').onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('emp-index').value;
    const data = { 
        nombre: document.getElementById('emp-nombre').value, 
        puesto: document.getElementById('emp-puesto').value, 
        sueldo: parseFloat(document.getElementById('emp-sueldo').value) 
    };

    if(id === "") {
        await addDoc(collection(window.db, "empleados"), data);
    } else {
        await updateDoc(doc(window.db, "empleados", id), data);
    }
    closeModal('modal-empleado');
    e.target.reset();
    document.getElementById('emp-index').value = "";
    showToast("Personal guardado");
};

function updateEmpleadosTable() {
    const table = document.getElementById('table-empleados');
    if(!table) return;
    table.innerHTML = empleados.map((emp) => `
        <tr class="hover:bg-slate-50 transition">
            <td class="p-4 font-bold text-slate-700">${emp.nombre}</td>
            <td class="p-4 text-slate-500">${emp.puesto}</td>
            <td class="p-4 font-bold text-blue-600">$${emp.sueldo.toLocaleString('es-AR')}</td>
            <td class="p-4 text-right space-x-2">
                <button onclick="cargarSueldoComoGasto('${emp.id}')" class="text-[10px] bg-green-100 text-green-700 px-2 py-1 rounded font-bold">Cargar gasto</button>
                <button onclick="editEmpleado('${emp.id}')" class="text-blue-600"><i class="fas fa-edit"></i></button>
                <button onclick="deleteEmpleado('${emp.id}')" class="text-red-400"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="4" class="p-8 text-center text-slate-400 italic text-sm">Sin empleados.</td></tr>';
}

window.cargarSueldoComoGasto = async function(id) {
    const emp = empleados.find(e => e.id === id);
    if(await customConfirm({ title: 'Cargar Sueldo', text: `¿Cargar el sueldo de ${emp.nombre} como gasto?` })) {
        const hoy = new Date();
        await addDoc(collection(window.db, "boletas"), {
            tipo: 'Sueldos', 
            proveedor: 'Interno', 
            detalle: `Sueldo ${emp.nombre}`,
            monto: emp.sueldo, 
            vencimiento: getFechaOperativa(), 
            pagado: false,
            mes: hoy.getMonth() + 1, 
            anio: hoy.getFullYear()
        });
        showToast("Sueldo cargado");
    }
};

window.editEmpleado = function(id) {
    const emp = empleados.find(e => e.id === id);
    document.getElementById('emp-index').value = id;
    document.getElementById('emp-nombre').value = emp.nombre;
    document.getElementById('emp-puesto').value = emp.puesto;
    document.getElementById('emp-sueldo').value = emp.sueldo;
    openModal('modal-empleado');
};

window.deleteEmpleado = async function(id) {
    if(await customConfirm({ title: 'Eliminar', text: '¿Borrar empleado?', type: 'red' })) {
        await deleteDoc(doc(window.db, "empleados", id));
    }
};

// --- PROVEEDORES ---
document.getElementById('form-proveedor').onsubmit = async (e) => {
    e.preventDefault();
    await addDoc(collection(window.db, "proveedores"), {
        nombre: document.getElementById('prov-nombre').value,
        rubro: document.getElementById('prov-rubro').value,
        tel: document.getElementById('prov-tel').value
    });
    closeModal('modal-proveedor');
    e.target.reset();
    showToast("Proveedor guardado");
};

function updateProveedoresGrid() {
    const grid = document.getElementById('grid-proveedores');
    if(!grid) return;
    grid.innerHTML = proveedores.map((p) => `
        <div class="bg-white p-6 rounded-lg border shadow-sm flex justify-between items-start">
            <div><h4 class="font-bold text-lg leading-tight">${p.nombre}</h4>
            <p class="text-blue-600 text-xs font-bold uppercase mt-1 tracking-wider">${p.rubro}</p>
            <p class="text-slate-500 text-sm mt-3"><i class="fas fa-phone mr-1"></i> ${p.tel || 'S/T'}</p></div>
            <button onclick="deleteProveedor('${p.id}')" class="text-slate-300 hover:text-red-500"><i class="fas fa-times-circle"></i></button>
        </div>
    `).join('') || '<p class="col-span-3 text-center p-8 text-slate-400 italic">Sin proveedores.</p>';
}

window.deleteProveedor = async function(id) {
    if(await customConfirm({ title: 'Eliminar', text: '¿Borrar proveedor?', type: 'red' })) {
        await deleteDoc(doc(window.db, "proveedores", id));
    }
};

// --- GASTOS / BOLETAS ---
window.setFilter = function(filter) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active-filter'));
    document.getElementById('filter-' + filter).classList.add('active-filter');
    updateBoletasTable();
};

document.getElementById('form-boleta').onsubmit = async (e) => {
    e.preventDefault();
    const hoy = new Date();
    await addDoc(collection(window.db, "boletas"), {
        tipo: document.getElementById('b-tipo').value,
        proveedor: document.getElementById('b-proveedor').value,
        detalle: document.getElementById('b-detalle').value,
        monto: parseFloat(document.getElementById('b-monto').value),
        vencimiento: document.getElementById('b-vencimiento').value,
        pagado: false, 
        mes: hoy.getMonth() + 1, 
        anio: hoy.getFullYear()
    });
    closeModal('modal-boleta');
    e.target.reset();
    showToast("Gasto registrado");
};

function updateBoletasTable() {
    const table = document.getElementById('table-boletas');
    if(!table) return;
    const hoyFormateado = getFechaOperativa();
    
    let filtradas = boletas.filter(b => {
        const diff = Math.ceil((new Date(b.vencimiento) - new Date(hoyFormateado)) / 86400000);
        if (currentFilter === 'pagado') return b.pagado;
        if (currentFilter === 'pendiente') return !b.pagado && diff >= 0;
        if (currentFilter === 'vencido') return !b.pagado && diff < 0;
        return true; 
    });

    table.innerHTML = filtradas.map((b) => {
        const diff = Math.ceil((new Date(b.vencimiento) - new Date(hoyFormateado)) / 86400000);
        let badge = b.pagado ? 'bg-green-100 text-green-700' : (diff < 0 ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-700');
        let text = b.pagado ? 'PAGADO' : (diff < 0 ? 'VENCIDO' : `Faltan ${diff}d`);
        return `
            <tr class="hover:bg-slate-50 transition">
                <td class="p-4 font-bold text-xs text-slate-400 uppercase">${b.tipo}</td>
                <td class="p-4"><span class="font-bold block text-slate-700">${b.proveedor}</span><span class="text-[10px] text-slate-400 italic">${b.detalle}</span></td>
                <td class="p-4 text-slate-500">${formatDateForDisplay(b.vencimiento)}</td>
                <td class="p-4 font-bold text-slate-800">$${b.monto.toLocaleString('es-AR')}</td>
                <td class="p-4"><span class="px-2 py-1 rounded text-[10px] font-black ${badge}">${text}</span></td>
                <td class="p-4 text-right">
                    ${!b.pagado ? `<button onclick="pagar('${b.id}')" class="bg-blue-600 text-white px-3 py-1 rounded text-xs shadow hover:bg-blue-700 transition">PAGAR</button>` : '<i class="fas fa-check-circle text-green-500 text-lg"></i>'}
                </td>
            </tr>
        `;
    }).join('') || '<tr><td colspan="6" class="p-12 text-center text-slate-300 italic">Nada por aquí.</td></tr>';
}

window.pagar = async function(id) {
    const b = boletas.find(x => x.id === id);
    if (await customConfirm({ title: 'Confirmar Pago', text: `¿Marcas como paga esta boleta de $${b.monto.toLocaleString('es-AR')}?` })) {
        await updateDoc(doc(window.db, "boletas", id), { pagado: true });
        showToast("Pago registrado");
    }
};

// --- DASHBOARD (ACTUALIZADO: SOLO VENCIMIENTOS PRÓXIMOS) ---
function updateDashboard() {
    const hoy = new Date(); 
    const mesA = hoy.getMonth() + 1; 
    const anioA = hoy.getFullYear();
    const hoyF = getFechaOperativa();
    
    let stats = { vencidas: 0, porVencer: 0, pagado: 0, pendiente: 0 };
    let categorias = {};
    let proximosVencimientos = []; // Para guardar los datos del aviso

    const delMes = boletas.filter(b => b.mes === mesA && b.anio === anioA);
    
    delMes.forEach(b => {
        const diff = Math.ceil((new Date(b.vencimiento) - new Date(hoyF)) / 86400000);
        
        if(b.pagado) {
            stats.pagado += b.monto;
        } else {
            stats.pendiente += b.monto;
            if(diff < 0) {
                stats.vencidas++; 
            } else if(diff <= 7) {
                stats.porVencer++;
                // Guardamos la info para el aviso
                proximosVencimientos.push({
                    proveedor: b.proveedor,
                    monto: b.monto,
                    dias: diff
                });
            }
        }
        categorias[b.tipo] = (categorias[b.tipo] || 0) + b.monto;
    });

    // 1. Actualizar las tarjetas superiores (KPIs)
    const kpi = document.getElementById('kpi-cards');
    if(kpi) {
        kpi.innerHTML = `
            <div class="bg-white p-6 rounded-lg shadow-sm border-l-4 border-red-500"><p class="text-slate-500 text-xs font-bold uppercase">Vencidas</p><h3 class="text-3xl font-bold text-red-600 mt-1">${stats.vencidas}</h3></div>
            <div class="bg-white p-6 rounded-lg shadow-sm border-l-4 border-yellow-500"><p class="text-slate-500 text-xs font-bold uppercase">A vencer (7d)</p><h3 class="text-3xl font-bold text-yellow-600 mt-1">${stats.porVencer}</h3></div>
            <div class="bg-white p-6 rounded-lg shadow-sm border-l-4 border-green-500"><p class="text-slate-500 text-xs font-bold uppercase">Pagado Mes</p><h3 class="text-3xl font-bold text-green-600 mt-1">$${stats.pagado.toLocaleString('es-AR')}</h3></div>
            <div class="bg-white p-6 rounded-lg shadow-sm border-l-4 border-blue-500"><p class="text-slate-500 text-xs font-bold uppercase">Deuda Pendiente</p><h3 class="text-3xl font-bold text-blue-600 mt-1">$${stats.pendiente.toLocaleString('es-AR')}</h3></div>
        `;
    }

    // 2. Actualizar el cuadro de "Aviso del Sistema" (Solo vencimientos)
    const statusEl = document.getElementById('status-message');
    if(statusEl) {
        if(proximosVencimientos.length > 0) {
            // Ordenar para que el que vence más pronto aparezca primero
            proximosVencimientos.sort((a, b) => a.dias - b.dias);
            
            statusEl.innerHTML = `
                <div class="space-y-3">
                    ${proximosVencimientos.map(v => `
                        <div class="flex justify-between items-center bg-slate-50 p-2 rounded border-l-2 border-yellow-400">
                            <div>
                                <p class="text-sm font-bold text-slate-700">${v.proveedor}</p>
                                <p class="text-[10px] text-slate-500 italic">Monto: $${v.monto.toLocaleString('es-AR')}</p>
                            </div>
                            <span class="text-[10px] font-black bg-yellow-100 text-yellow-700 px-2 py-1 rounded">
                                FALTAN ${v.dias} DÍAS
                            </span>
                        </div>
                    `).join('')}
                </div>
            `;
        } else {
            statusEl.innerHTML = `<p class="text-slate-400 italic text-sm text-center py-2">No hay vencimientos próximos en los siguientes 7 días.</p>`;
        }
    }

    // 3. Actualizar gráfico de categorías
    const total = stats.pagado + stats.pendiente;
    const chart = document.getElementById('category-chart');
    if(chart) {
        chart.innerHTML = Object.entries(categorias).map(([cat, m]) => `
            <div><div class="flex justify-between text-xs mb-1"><span class="font-bold text-slate-500 uppercase">${cat}</span><span class="font-black">$${m.toLocaleString('es-AR')}</span></div><div class="w-full bg-slate-50 h-2 rounded-full overflow-hidden border"><div class="bg-blue-600 h-full" style="width: ${Math.min((m/total)*100, 100)}%"></div></div></div>
        `).join('') || '<p class="text-slate-300 italic text-sm">Sin movimientos.</p>';
    }
}

// --- VENTAS DIARIAS ---
function updateVentasUI() {
    const table = document.getElementById('table-ventas');
    const totalMesDisplay = document.getElementById('ventas-total-mes');
    if (!table || !totalMesDisplay) return;

    const sortedVentas = [...ventasDiarias].sort((a,b) => b.fecha.localeCompare(a.fecha));

    table.innerHTML = sortedVentas.map((v) => `
        <tr class="hover:bg-slate-50 transition">
            <td class="p-4 font-bold text-slate-700">${formatDateForDisplay(v.fecha)}</td>
            <td class="p-4 font-bold text-blue-600">$${v.monto.toLocaleString('es-AR')}</td>
            <td class="p-4 text-right space-x-3">
                <button onclick="editVenta('${v.id}')" class="text-blue-500 hover:text-blue-700" title="Editar"><i class="fas fa-edit"></i></button>
                <button onclick="deleteVenta('${v.id}')" class="text-red-300 hover:text-red-500" title="Eliminar"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="3" class="p-8 text-center text-slate-400 italic">No hay cierres este mes.</td></tr>';

    const total = ventasDiarias.reduce((acc, v) => acc + v.monto, 0);
    totalMesDisplay.innerText = `$${total.toLocaleString('es-AR')}`;
}

async function handleCerrarCaja() {
    const inputMonto = document.getElementById('venta-monto');
    const monto = parseFloat(inputMonto.value);
    if (!monto || monto <= 0) return showToast("Monto inválido");

    const hoy = getFechaOperativa(); 
    const existe = ventasDiarias.find(v => v.fecha === hoy);

    if (existe) {
        if(!(await customConfirm({ title: 'Ya registrado', text: `¿Sobrescribir el cierre de ${formatDateForDisplay(hoy)}?` }))) return;
        await deleteDoc(doc(window.db, "ventas", existe.id));
    }

    await addDoc(collection(window.db, "ventas"), { fecha: hoy, monto: monto });
    inputMonto.value = '';
    showToast("Cierre de caja guardado");
}

window.editVenta = function(id) {
    const v = ventasDiarias.find(x => x.id === id);
    document.getElementById('venta-monto').value = v.monto;
    document.getElementById('venta-monto').focus();
    showToast("Edita el monto y vuelve a cerrar caja");
};

window.deleteVenta = async function(id) {
    if(await customConfirm({ title: 'Eliminar', text: '¿Borrar este registro?', type: 'red' })) {
        await deleteDoc(doc(window.db, "ventas", id));
    }
};

// --- FINALIZAR MES Y HISTORIAL ---
window.confirmarFinalizarMes = async function() {
    if(await customConfirm({ title: 'Finalizar mes', text: 'Se archivarán los gastos pagados y ventas. Esta acción vaciará las tablas actuales.' })) {
        const batch = writeBatch(window.db);
        const periodo = new Date().toLocaleString('es-AR', { month: 'long', year: 'numeric' });
        
        const totalGastos = boletas.filter(b => b.pagado).reduce((acc, b) => acc + b.monto, 0);
        const totalVentas = ventasDiarias.reduce((acc, v) => acc + v.monto, 0);

        const histRef = doc(collection(window.db, "historial"));
        batch.set(histRef, {
            periodo, 
            cant: boletas.filter(b => b.pagado).length,
            totalGastos, 
            totalVentas,
            fechaCierre: new Date().toISOString()
        });

        boletas.filter(b => b.pagado).forEach(b => {
            batch.delete(doc(window.db, "boletas", b.id));
        });

        ventasDiarias.forEach(v => {
            batch.delete(doc(window.db, "ventas", v.id));
        });

        await batch.commit();
        showToast("Mes finalizado y archivado");
    }
};

window.updateHistorialTable = function() {
    const table = document.getElementById('table-historial');
    if(!table) return;
    const queryStr = document.getElementById('history-search').value.toLowerCase();
    const filtrado = historial.filter(h => h.periodo.toLowerCase().includes(queryStr));
    
    table.innerHTML = filtrado.map(h => `
        <tr class="hover:bg-slate-50 transition text-sm">
            <td class="p-4 font-bold capitalize text-slate-700">${h.periodo}</td>
            <td class="p-4 text-slate-500 font-medium">${h.cant} boletas</td>
            <td class="p-4 font-black text-green-600">$${(h.totalVentas || 0).toLocaleString('es-AR')}</td>
            <td class="p-4 font-black text-red-600">$${(h.totalGastos || 0).toLocaleString('es-AR')}</td>
            <td class="p-4 text-right"><span class="text-[10px] bg-slate-100 px-3 py-1 rounded-full font-black text-slate-400 uppercase">Archivado</span></td>
        </tr>
    `).join('') || '<tr><td colspan="5" class="p-12 text-center text-slate-300 italic">No hay registros.</td></tr>';
};

window.borrarHistorialCompleto = async function() {
    if(await customConfirm({ title: 'Borrar historial', text: 'Se eliminará el historial para siempre.', type: 'red' })) {
        const batch = writeBatch(window.db);
        historial.forEach(h => batch.delete(doc(window.db, "historial", h.id)));
        await batch.commit();
        showToast("Historial eliminado");
    }
};

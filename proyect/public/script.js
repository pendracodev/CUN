// Configuración de la API
const API_BASE_URL = 'http://localhost:3000/api';

// Función para mostrar alertas
function showAlert(message, type = 'success') {
    const alertContainer = document.getElementById('alertContainer');
    if (!alertContainer) return;
    
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()" class="alert-close">&times;</button>
    `;
    
    alertContainer.innerHTML = '';
    alertContainer.appendChild(alertDiv);
    
    // Auto-remover después de 5 segundos
    setTimeout(() => {
        if (alertDiv.parentElement) {
            alertDiv.remove();
        }
    }, 5000);
}

// Función para hacer peticiones HTTP
async function apiRequest(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Error en la petición');
        }

        return data;
    } catch (error) {
        console.error('Error en petición API:', error);
        throw error;
    }
}

// Configurar fechas mínimas
function setupDateInputs() {
    const fechaEntrada = document.getElementById('fecha_entrada');
    const fechaSalida = document.getElementById('fecha_salida');
    
    if (fechaEntrada && fechaSalida) {
        const hoy = new Date().toISOString().split('T')[0];
        fechaEntrada.min = hoy;
        fechaSalida.min = hoy;

        fechaEntrada.addEventListener('change', function() {
            const fechaSeleccionada = new Date(this.value);
            fechaSeleccionada.setDate(fechaSeleccionada.getDate() + 1);
            fechaSalida.min = fechaSeleccionada.toISOString().split('T')[0];
            
            if (fechaSalida.value && new Date(fechaSalida.value) <= new Date(this.value)) {
                fechaSalida.value = '';
            }
        });
    }
}

// Manejar envío del formulario de reservas
function setupReservationForm() {
    const form = document.getElementById('reservationForm');
    if (!form) return;

    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const submitBtn = document.getElementById('submitBtn');
        const originalText = submitBtn.textContent;
        
        try {
            // Deshabilitar botón y mostrar loading
            submitBtn.disabled = true;
            submitBtn.textContent = 'Procesando...';

            const formData = new FormData(this);
            const reservaData = {
                nombre: formData.get('nombre').trim(),
                apellido: formData.get('apellido').trim(),
                correo: formData.get('correo').trim(),
                telefono: formData.get('telefono').trim(),
                fecha_entrada: formData.get('fecha_entrada'),
                fecha_salida: formData.get('fecha_salida'),
                tipo_habitacion: formData.get('tipo_habitacion'),
                num_personas: parseInt(formData.get('num_personas'))
            };

            // Validaciones adicionales en frontend
            if (!reservaData.nombre || !reservaData.apellido || !reservaData.correo || !reservaData.telefono) {
                throw new Error('Todos los campos personales son obligatorios');
            }

            if (!reservaData.fecha_entrada || !reservaData.fecha_salida || !reservaData.tipo_habitacion || !reservaData.num_personas) {
                throw new Error('Todos los campos de reserva son obligatorios');
            }

            // Validar email
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(reservaData.correo)) {
                throw new Error('Por favor ingresa un correo válido');
            }

            // Enviar datos al servidor
            const response = await apiRequest('/reservas', {
                method: 'POST',
                body: JSON.stringify(reservaData)
            });

            showAlert(`¡Reserva creada exitosamente! ID: ${response.reserva.id}`, 'success');
            this.reset();
            setupDateInputs(); // Reconfigurar fechas después del reset

        } catch (error) {
            showAlert(error.message, 'error');
        } finally {
            // Rehabilitar botón
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    });
}

// Función para buscar reservas por correo (para lista_reservas.html)
async function searchReservationsByEmail() {
    const emailInput = document.getElementById('searchEmail');
    if (!emailInput) return;

    const email = emailInput.value.trim();
    if (!email) {
        showAlert('Por favor ingresa un correo electrónico', 'error');
        return;
    }

    try {
        const reservas = await apiRequest(`/reservas/correo/${encodeURIComponent(email)}`);
        displayReservations(reservas, 'userReservations', false);
        
        if (reservas.length === 0) {
            showAlert('No se encontraron reservas para este correo', 'error');
        } else {
            showAlert(`Se encontraron ${reservas.length} reserva(s)`, 'success');
        }
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

// Función para cargar todas las reservas (para admin.html)
async function loadAllReservations(filters = {}) {
    try {
        const queryParams = new URLSearchParams();
        
        // Agregar filtros si existen
        Object.keys(filters).forEach(key => {
            if (filters[key]) {
                queryParams.append(key, filters[key]);
            }
        });

        const queryString = queryParams.toString();
        const endpoint = queryString ? `/reservas?${queryString}` : '/reservas';
        
        const reservas = await apiRequest(endpoint);
        displayReservations(reservas, 'adminReservations', true);
        
        showAlert(`Se cargaron ${reservas.length} reserva(s)`, 'success');
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

// Función para mostrar reservas en tabla
function displayReservations(reservations, containerId, isAdmin = false) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (reservations.length === 0) {
        container.innerHTML = '<p class="no-data">No se encontraron reservas.</p>';
        return;
    }

    let tableHTML = `
        <div class="table-container">
            <table class="reservations-table">
                <thead>
                    <tr>
                        ${isAdmin ? '<th>ID</th>' : ''}
                        <th>Nombre</th>
                        <th>Correo</th>
                        <th>Teléfono</th>
                        <th>Entrada</th>
                        <th>Salida</th>
                        <th>Habitación</th>
                        <th>Personas</th>
                        <th>Estado</th>
                        <th>Creada</th>
                        ${isAdmin ? '<th>Acciones</th>' : ''}
                    </tr>
                </thead>
                <tbody>
    `;

    reservations.forEach(reserva => {
        const fechaCreacion = new Date(reserva.fecha_creacion).toLocaleDateString('es-ES');
        
        tableHTML += `
            <tr>
                ${isAdmin ? `<td>${reserva.id}</td>` : ''}
                <td>${reserva.nombre} ${reserva.apellido}</td>
                <td>${reserva.correo}</td>
                <td>${reserva.telefono}</td>
                <td>${new Date(reserva.fecha_entrada).toLocaleDateString('es-ES')}</td>
                <td>${new Date(reserva.fecha_salida).toLocaleDateString('es-ES')}</td>
                <td class="capitalize">${reserva.tipo_habitacion}</td>
                <td>${reserva.num_personas}</td>
                <td><span class="status status-${reserva.estado}">${reserva.estado}</span></td>
                <td>${fechaCreacion}</td>
                ${isAdmin ? `
                    <td class="actions">
                        <button onclick="updateReservationStatus(${reserva.id}, 'activa')" 
                                class="btn btn-sm btn-success" 
                                ${reserva.estado === 'activa' ? 'disabled' : ''}>
                            Activar
                        </button>
                        <button onclick="updateReservationStatus(${reserva.id}, 'completada')" 
                                class="btn btn-sm btn-info"
                                ${reserva.estado === 'completada' ? 'disabled' : ''}>
                            Completar
                        </button>
                        <button onclick="cancelReservation(${reserva.id})" 
                                class="btn btn-sm btn-danger"
                                ${reserva.estado === 'cancelada' ? 'disabled' : ''}>
                            Cancelar
                        </button>
                    </td>
                ` : ''}
            </tr>
        `;
    });

    tableHTML += `
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = tableHTML;
}

// Función para actualizar estado de reserva
async function updateReservationStatus(id, newStatus) {
    if (!confirm(`¿Estás seguro de cambiar el estado a "${newStatus}"?`)) {
        return;
    }

    try {
        await apiRequest(`/reservas/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ estado: newStatus })
        });

        showAlert(`Reserva ${id} actualizada a "${newStatus}"`, 'success');
        loadAllReservations(); // Recargar tabla
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

// Función para cancelar reserva
async function cancelReservation(id) {
    if (!confirm('¿Estás seguro de cancelar esta reserva?')) {
        return;
    }

    try {
        await apiRequest(`/reservas/${id}`, {
            method: 'DELETE'
        });

        showAlert(`Reserva ${id} cancelada`, 'success');
        loadAllReservations(); // Recargar tabla
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

// Función para aplicar filtros (admin)
function applyFilters() {
    const estado = document.getElementById('filterEstado')?.value || '';
    const tipoHabitacion = document.getElementById('filterHabitacion')?.value || '';
    const fechaDesde = document.getElementById('filterFechaDesde')?.value || '';
    const fechaHasta = document.getElementById('filterFechaHasta')?.value || '';

    const filters = {};
    if (estado) filters.estado = estado;
    if (tipoHabitacion) filters.tipo_habitacion = tipoHabitacion;
    if (fechaDesde) filters.fecha_desde = fechaDesde;
    if (fechaHasta) filters.fecha_hasta = fechaHasta;

    loadAllReservations(filters);
}

// Función para limpiar filtros
function clearFilters() {
    const filterInputs = ['filterEstado', 'filterHabitacion', 'filterFechaDesde', 'filterFechaHasta'];
    filterInputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.value = '';
    });
    loadAllReservations();
}

// Función para exportar datos
async function exportData() {
    try {
        const reservas = await apiRequest('/reservas');
        
        const dataStr = JSON.stringify(reservas, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `reservas_hotel_colombia_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(url);
        showAlert('Datos exportados exitosamente', 'success');
    } catch (error) {
        showAlert('Error al exportar datos: ' + error.message, 'error');
    }
}

// Cargar estadísticas (para admin)
async function loadStatistics() {
    try {
        const stats = await apiRequest('/estadisticas');
        displayStatistics(stats);
    } catch (error) {
        console.error('Error cargando estadísticas:', error);
    }
}

// Mostrar estadísticas
function displayStatistics(stats) {
    const container = document.getElementById('statisticsContainer');
    if (!container) return;

    let html = `
        <div class="stats-grid">
            <div class="stat-card">
                <h3>Reservas del Mes</h3>
                <div class="stat-number">${stats.reservasMesActual}</div>
            </div>
    `;

    // Estadísticas por estado
    if (stats.porEstado && stats.porEstado.length > 0) {
        stats.porEstado.forEach(item => {
            html += `
                <div class="stat-card">
                    <h3>Reservas ${item.estado}</h3>
                    <div class="stat-number">${item.total}</div>
                </div>
            `;
        });
    }

    html += '</div>';

    // Gráfico de habitaciones (simple)
    if (stats.porHabitacion && stats.porHabitacion.length > 0) {
        html += `
            <div class="chart-container">
                <h3>Reservas por Tipo de Habitación</h3>
                <div class="bar-chart">
        `;
        
        const maxValue = Math.max(...stats.porHabitacion.map(item => parseInt(item.total)));
        
        stats.porHabitacion.forEach(item => {
            const percentage = (parseInt(item.total) / maxValue) * 100;
            html += `
                <div class="bar-item">
                    <div class="bar" style="width: ${percentage}%"></div>
                    <span class="bar-label">${item.tipo_habitacion}: ${item.total}</span>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
}

// Inicialización cuando el DOM está listo
document.addEventListener('DOMContentLoaded', function() {
    setupDateInputs();
    setupReservationForm();
    
    // Si estamos en la página de admin, cargar estadísticas
    if (document.getElementById('statisticsContainer')) {
        loadStatistics();
    }
});
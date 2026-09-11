# Supply Chain Arena · versión definitiva

## Arranque local
1. Abre una terminal dentro de esta carpeta.
2. Ejecuta: `node server.js`
3. Docente: `http://localhost:3000/teacher.html`
4. Usa las direcciones que muestra la terminal para Torre de Control, Producción y Transportista desde los dispositivos conectados a la misma red.

No requiere Internet ni paquetes npm externos.

## Flujo de la dinámica
Docente crea pedido → Torre define ruta y lote → Producción fabrica y libera → Transportistas recogen → entregan o son interceptados → Torre usa estadísticas y mapa de calor para decidir los siguientes pedidos.

## Torre de Control
La sección **Decisión** conserva los cambios de puntos intermedios y tamaño de lote mientras se edita, incluso cuando el tablero se actualiza cada segundo. Al pulsar **MANDAR A PRODUCCIÓN** o **GUARDAR CAMBIOS**, la ruta y el lote se guardan en el servidor.

## Pedidos en paralelo
La plataforma admite múltiples pedidos activos por equipo. Producción puede trabajar con varios pedidos y distintos transportistas pueden llevar simultáneamente envíos de pedidos diferentes o lotes distintos de un mismo pedido.

## Kanban
El panel Docente y la Torre de Control incluyen un Kanban automático de solo lectura con las etapas: Nuevo, Producción, Listo, Distribución y Completado/Vencido.

## Despliegue
La aplicación requiere un servidor Node.js. Puede desplegarse directamente desde este repositorio en Render usando:
- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`

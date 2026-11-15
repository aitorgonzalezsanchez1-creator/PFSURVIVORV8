# PFSURVIVORV8 — FP Survivor 3D Online

Juego **survivor 3D** con cooperativo online para **hasta 4 jugadores**, 22 personajes y 8 armas evolutivas. Todo corre en el navegador (Three.js) y el multijugador funciona con un servidor Node.js + Socket.IO.

## Características

- 22 personajes con ataque básico, especial, pasiva, evolución y modelo 3D.
- 8 armas nuevas evolutivas (espadas orbitales, lluvia de meteoritos, agujero negro, dragón espiritual, prisión de cristal, martillo titán, nube de esporas y rayo prismático).
- Salas públicas y privadas con código de 6 caracteres, sin escribir ninguna dirección de servidor.
- Nivel cooperativo **individual**: cada jugador recibe sus propias 4 cartas según sus armas/pasivas, elige la suya y tiene 2 rerolls propios. La ronda sigue cuando todos los jugadores vivos han elegido.
- Invitado mejorado: envío de controles al instante, limpieza de teclas al perder el foco y corrección de posición suave (snapshots a 20 Hz con 1–2 jugadores y 15 Hz con 3–4).
- Progresión, tienda, objetos, logros, codes y calidad gráfica AUTO/ULTRA/ALTO/MEDIO/BAJO.
- Diagnóstico con F3: FPS, ping, snapshots, entidades, draw calls, triángulos, memoria y calidad.

## Jugar en tu PC

1. Instala [Node.js LTS](https://nodejs.org).
2. Ejecuta `INSTALAR_Y_JUGAR.bat` (instala dependencias la primera vez).
3. Abre <http://localhost:3000>.

También puedes abrir `index.html` directamente para jugar en solitario.

## Jugar online

- El anfitrión crea una sala (pública o privada) y comparte el **código de 6 caracteres**.
- Los demás escriben su nombre, el código y pulsan **Unirse**. No hay que configurar ningún enlace.
- El anfitrión ejecuta la simulación y sincroniza al resto; los invitados envían sus controles y ven el mundo centrado en su personaje.

## Publicar el servidor (Render)

1. Sube este repositorio a GitHub.
2. En [Render](https://render.com): **New + → Blueprint** y selecciona el repo (usa `render.yaml`).
3. Comprueba que la URL publicada responde en `/health`.
4. Abre esa URL y juega: la conexión es automática.

> En el plan gratuito de Render el servidor se duerme y puede tardar ~1 minuto en despertar.

## Estructura

```
index.html            Juego completo (cliente + lógica)
server.js             Servidor Express + Socket.IO (salas y snapshots)
INSTALAR_Y_JUGAR.bat  Lanzador para Windows
package.json          Dependencias y scripts
render.yaml           Despliegue en Render
LEEME.txt             Instrucciones detalladas en español
```

## Notas

- Sin reconexión a mitad de partida: si el anfitrión se desconecta, la partida termina.
- Si un jugador se va, su personaje cae y los demás continúan.

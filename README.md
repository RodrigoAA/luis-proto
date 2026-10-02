# luis-proto

Asistente para el despacho de Luis. Luis sube una notificación (el PDF que reenvía el procurador desde LexNET, una carta de Hacienda o de la DEHú, una de la Seguridad Social o la foto de una carta en papel) y recibe una **ficha**: qué es, de qué juzgado u organismo viene, el **plazo propuesto en rojo** para que lo confirme, qué hay que hacer y un mensaje en lenguaje claro para el cliente. Luis lo revisa y lo copia a WhatsApp. **Nada se envía solo.**

- App: https://luis-proto.vercel.app (pide un código de acceso)
- Maqueta original de Emil: https://luis-proto.vercel.app/maqueta

Es un prototipo con documentos inventados (`docs/`). No hay que subir documentos reales sin tapar nombres, DNI, nº de procedimiento y NIG.

## Cómo funciona

1. **La IA solo lee.** El archivo va a la API de OpenAI (modelo `gpt-4.1-mini`), que devuelve los datos del documento en un formato fijo (`lib/schema.js`, basado en `fichas/ficha-schema.json` de Emil): tipo, organismo, fecha de acceso, días del plazo, para quién es, municipio, canal…
2. **El código calcula el plazo.** `lib/plazos.js` aplica las reglas de Mariano (`reglas-plazos.md`): días hábiles, agosto y Navidad inhábiles en los juzgados, día de gracia hasta las 15:00, notificación presunta de LexNET (3 días) y de la DEHú (10 días), plazos en meses y festivos (`data/festivos.json`). Así un error de la IA nunca acaba en un plazo mal contado.
3. **Si falta un dato, pregunta.** Si no se sabe si el cliente es demandante o demandado, o si es una carta en papel y no se sabe qué día la recibió, la ficha lo pregunta y recalcula con la respuesta (sin volver a llamar a la IA).
4. **El mensaje al cliente** nunca lleva importes, DNI, nº de procedimiento ni NIG. La IA tiene prohibido ponerlos y además el código los borra si se cuelan.

## Qué hay en cada carpeta

| Pieza | Qué hace |
|---|---|
| `public/index.html` | La app para el móvil (estilo WhatsApp). Pide el código una vez, deja subir PDF o foto y enseña la ficha. |
| `public/ejemplos/` | Los 6 PDF inventados para probar. |
| `api/ficha.js` | Recibe el archivo, comprueba el código, llama a la IA y devuelve la ficha. |
| `api/plazo.js` | Recalcula la ficha cuando Luis responde a una pregunta. No usa la IA. |
| `lib/ia.js` | La llamada a OpenAI. |
| `lib/schema.js` | El formato de respuesta de la IA y las instrucciones (el *prompt*). |
| `lib/plazos.js` | El cálculo de plazos. |
| `lib/ficha.js` | Junta datos + plazo y limpia el mensaje al cliente. |
| `data/festivos.json` | Festivos 2026 y 2027 (nacionales, Extremadura, Cáceres y Plasencia) con la fuente oficial de cada uno. |
| `scripts/eval.mjs` | Pasa los 6 documentos y los compara con `fichas/fichas-referencia.json`. |
| `test/` | Pruebas del cálculo de plazos. |
| `docs/`, `fichas/`, `*.md` | Materiales del squad: documentos, esquema, fichas de referencia, reglas. |

## Variables de entorno (en Vercel → Settings → Environment Variables)

| Variable | Para qué |
|---|---|
| `OPENAI_API_KEY` | Clave de la API de OpenAI. Nunca en el código. |
| `ACCESS_CODE` | El código que mete Luis en la app. |
| `OPENAI_MODEL` | Opcional. Por defecto `gpt-4.1-mini`. |
| `MAX_PETICIONES_HORA` | Opcional. Límite de lecturas por hora y dispositivo. Por defecto 40. |

**Cambiar el código de acceso:** en Vercel, edita `ACCESS_CODE` y vuelve a desplegar (Deployments → ⋯ → Redeploy). O desde la terminal:

```bash
vercel env rm ACCESS_CODE production
vercel env add ACCESS_CODE production   # te pide el valor nuevo
vercel --prod
```

**Cambiar la clave de OpenAI** (la actual caduca a los 7 días): igual, con `OPENAI_API_KEY`.

## Desplegar

Con la terminal, desde la carpeta del repositorio:

```bash
npm i -g vercel        # una vez
vercel login           # una vez
vercel --prod          # sube la versión actual a producción
```

Si el proyecto está conectado a GitHub en Vercel, cada push a `main` despliega solo.

## Probar

```bash
npm test                                   # pruebas del cálculo de plazos (sin IA, gratis)
OPENAI_API_KEY=... node scripts/eval.mjs   # pasa los 6 documentos por la IA (unos 0,01 $)
node scripts/eval.mjs --cache -v           # repite con la última respuesta guardada, sin gastar
```

Cada vez que llega un documento queda una línea en los logs de Vercel (`documento_recibido`, con `tipo: foto` o `pdf`), para contar en la semana de prueba cuántas fotos manda Luis.

## Límites del prototipo

- Archivos de hasta 3 MB (Vercel no admite peticiones de más de 4,5 MB). Las fotos se reducen en el móvil antes de subirlas.
- Lee el PDF directamente y las fotos con la visión del modelo. Si no puede leer algo, lo dice en vez de inventar.
- En una carta en papel la fecha que cuenta no viene en la carta: la ficha pregunta qué día la recibió el cliente.

## Antes de meter casos reales de Luis

1. **Contrato de encargado de tratamiento (DPA)** con OpenAI, firmado a tu nombre (o al del despacho), y Luis contigo.
2. **Región UE**: proyecto de OpenAI con residencia de datos en Europa (o pasar a un proveedor con servidores en la UE).
3. **Festivos verificados**: revisar `data/festivos.json` cada año. Hoy quedan pendientes los nacionales de 2027 en el BOE, los locales de Cáceres 2027 en el DOE y los locales de Plasencia 2027. Si un plazo cae en un año o municipio sin calendario, la ficha avisa.
4. Cuenta de la API y despliegue a tu nombre, con límite de gasto.
5. Materia penal: régimen especial de datos en el RGPD; mejor dejarla fuera de la prueba.

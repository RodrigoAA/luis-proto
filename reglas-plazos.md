# Cómo calcular los plazos (para el código, no para la IA)

La IA solo extrae los datos del documento. La fecha límite la calcula el código con estas reglas, y la ficha la muestra como propuesta para que Luis la confirme.

## Qué extrae la IA
- `jurisdiccion`: judicial | tributaria | seguridad_social | otra
- `fecha_notificacion`: la fecha en que el procurador o el cliente accedió (en LexNET o la DEHú), no la de puesta a disposición
- `fecha_puesta_disposicion`: si aparece
- `plazo_dias` y `unidad`: hábiles | naturales | meses
- `fecha_limite_en_documento`: si el documento ya trae la fecha, se usa esa y no se calcula nada
- `para_quien`: cliente | otra_parte | desconocido (si es desconocido, la ficha pregunta a Luis)
- `municipio_organo`: para los festivos locales

## Reglas
1. Se empieza a contar el día siguiente a la notificación.
2. **Judicial**: no cuentan los sábados, los domingos, los festivos ni el mes de agosto entero. Tampoco del 24 de diciembre al 6 de enero, salvo en lo penal, donde sí cuentan.
   - Día de gracia: el escrito se puede presentar hasta las 15:00 del día hábil siguiente al vencimiento.
   - En LexNET, si el procurador no abre la notificación en 3 días hábiles, se da por notificada al terminar el tercero.
3. **Tributaria y administrativa**: no cuentan los sábados, los domingos ni los festivos. Agosto y Navidad sí cuentan, y no hay día de gracia.
   - En la DEHú, si nadie abre la notificación en 10 días naturales, se da por rechazada y cuenta como notificada.
4. **Meses**: se vence el mismo número de día del mes que toque. Si ese día no existe, el último del mes. Si cae en inhábil, el siguiente hábil.
5. **Festivos**: los nacionales, los de la comunidad autónoma y los locales del municipio del órgano. Hay que cargarlos cada año de los calendarios oficiales: el BOE para los nacionales, el diario oficial de la comunidad para los autonómicos y la sede judicial o el ayuntamiento para los locales. No hay que fiarse de una lista fija.

## En la ficha
- La fecha va en rojo, con "confírmalo".
- Se explica en una línea desde cuándo se cuenta y qué días se han saltado.
- Si falta un dato (como para quién es el plazo), no se calcula nada y se pregunta.

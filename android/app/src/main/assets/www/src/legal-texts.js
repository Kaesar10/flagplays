// Textos legales de FlagPlays. Única fuente de verdad: de aquí se generan la
// sección «Información legal» de la app, las páginas web (docs/) y el documento
// de Drive. Ejecuta `node tools/build-legal-docs.mjs` tras editar algo.
//
// Estructura de cada documento:
//   { id, title, summary, updated, blocks: [{ t: 'h'|'p'|'ul'|'note', text | items }] }

export const LEGAL_UPDATED = '20 de noviembre de 2026';

export const LEGAL_TITULAR = {
  name: 'César E. Frías Ramos',
  email: 'kaesar10@gmail.com',
  web: 'https://kaesar10.github.io/flagplays/',
  app: 'FlagPlays',
};

export const LEGAL_DOCS = [
  {
    id: 'privacidad',
    title: 'Política de privacidad',
    summary: 'Qué datos usa FlagPlays. Respuesta corta: ninguno sale de tu dispositivo.',
    updated: LEGAL_UPDATED,
    blocks: [
      {
        t: 'note',
        text: 'Resumen: FlagPlays no recopila, no transmite y no comparte ningún dato personal. Todo lo que dibujas se queda en tu dispositivo y la aplicación funciona sin conexión.',
      },
      { t: 'h', text: '1. Responsable' },
      {
        t: 'p',
        text: 'FlagPlays es una aplicación desarrollada por César E. Frías Ramos. Para cualquier cuestión relacionada con privacidad puedes escribir a kaesar10@gmail.com.',
      },
      { t: 'h', text: '2. Qué datos se recogen' },
      { t: 'p', text: 'Ninguno. La aplicación no recoge datos personales, no crea cuentas y no pide registro. En concreto:' },
      {
        t: 'ul',
        items: [
          'No hay analítica, ni publicidad, ni identificadores de seguimiento.',
          'No se envía ninguna información a servidores propios ni de terceros.',
          'No se accede a contactos, cámara, micrófono, ubicación ni archivos ajenos.',
        ],
      },
      { t: 'h', text: '3. Dónde se guardan tus jugadas' },
      {
        t: 'p',
        text: 'Tus jugadas, árboles de rutas, rutas propias y preferencias se guardan solo en tu dispositivo, en el almacenamiento local de la aplicación. En Android viven en el espacio privado de la app; en Windows, en la carpeta %LOCALAPPDATA%\\FlagPlays. Se borran al desinstalar la aplicación, y en Android puedes borrarlos desde Ajustes → Aplicaciones → FlagPlays → Almacenamiento.',
      },
      { t: 'h', text: '4. Permisos que solicita' },
      {
        t: 'ul',
        items: [
          'Almacenamiento (solo Android 9 o anterior): para guardar los PDF, PNG y JSON que exportas en tu carpeta de descargas.',
          'Vibración: para el aviso táctil al guardar.',
        ],
      },
      {
        t: 'p',
        text: 'No solicita ningún otro permiso. En Android 10 y posteriores usa el almacenamiento compartido del sistema sin permisos adicionales.',
      },
      { t: 'h', text: '5. Exportaciones e impresión' },
      {
        t: 'p',
        text: 'Cuando exportas un PDF, un PNG o un JSON, o cuando imprimes, el archivo se crea en tu dispositivo y eres tú quien decide a dónde va. La aplicación no lo envía a ningún sitio.',
      },
      { t: 'h', text: '6. Menores' },
      {
        t: 'p',
        text: 'La aplicación es una herramienta de entrenamiento: no recoge datos de nadie, incluidos los menores, precisamente porque no recoge datos en absoluto.',
      },
      { t: 'h', text: '7. Tus derechos' },
      {
        t: 'p',
        text: 'Aunque no se tratan datos personales, si tienes cualquier duda sobre el Reglamento (UE) 2016/679 (RGPD) puedes escribir a kaesar10@gmail.com. Al no existir tratamiento de datos, no hay datos que rectificar ni suprimir en servidores: los únicos datos son los que tú guardas en tu propio dispositivo y puedes borrar cuando quieras.',
      },
      { t: 'h', text: '8. Cambios en esta política' },
      {
        t: 'p',
        text: 'Si alguna vez cambia, se publicará en esta misma dirección y se actualizará la fecha del encabezado. Mientras FlagPlays no incorpore funciones que envíen datos fuera del dispositivo, esta política seguirá siendo válida.',
      },
    ],
  },
  {
    id: 'terminos',
    title: 'Términos y condiciones de uso',
    summary: 'Condiciones para usar la app y el derecho de uso gratuito para equipos de la federación andaluza.',
    updated: LEGAL_UPDATED,
    blocks: [
      { t: 'h', text: '1. Quién hace FlagPlays' },
      {
        t: 'p',
        text: 'Esta app ha sido desarrollada por César E. Frías Ramos con la ayuda de la IA. César es conocido por jugar en tackle en Sevilla Linces durante los años 2005-2008 y estos últimos años por entrenar y jugar en Huelva Sailors y Aljarafe Harriers. Es conocido en redes como Kaesar (@kaesar10).',
      },
      { t: 'h', text: '2. Uso gratuito para los equipos de la federación andaluza' },
      {
        t: 'p',
        text: 'Esta app es de carácter gratuito para los equipos de flag inscritos en la federación andaluza de fútbol americano. Se les concede derecho de uso y distribución.',
      },
      { t: 'p', text: 'Queda prohibido el uso a cualquier equipo que no pertenezca a dicha federación andaluza.' },
      { t: 'h', text: '3. Código libre y aplicaciones' },
      {
        t: 'p',
        text: 'Esta app es de código libre. Si te interesa modificarla, puedes solicitar el repositorio a su creador. Además, tiene app de móvil: si te interesa tenerla, hay que solicitarla en el correo kaesar10@gmail.com.',
      },
      { t: 'h', text: '4. Versión beta' },
      {
        t: 'p',
        text: 'Esta app está en versión beta: si ves cualquier fallo, algo que falte o funcionalidad que te gustaría que tuviera, no dudes en decírselo a su creador. Las sugerencias se agradecen y ayudan a mejorar la app para todos.',
      },
      { t: 'h', text: '5. Tus jugadas se quedan contigo' },
      {
        t: 'p',
        text: 'Esta app se instala en local, no se sube nada a ninguna base de datos ni servidor, así que puedes estar seguro de que nadie va a ver tus jugadas.',
      },
      { t: 'h', text: '6. Aceptación de las condiciones' },
      {
        t: 'p',
        text: 'Para usar la aplicación debes aceptar estas condiciones. La aceptación se guarda en tu dispositivo y no vuelve a pedirse; puedes releerlas cuando quieras en el menú ⋮ → Términos y condiciones.',
      },
      { t: 'h', text: '7. Ámbito deportivo y responsabilidad' },
      {
        t: 'p',
        text: 'FlagPlays es una herramienta de dibujo y planificación. Las jugadas, lecturas y consejos son propuestas de entrenamiento y no garantizan resultados deportivos. Cada entrenador decide qué jugadas usar y cómo enseñarlas. El fútbol bandera es un deporte sin contacto: la app recuerda practicarlo con respeto a las reglas y a los rivales.',
      },
      {
        t: 'p',
        text: 'La aplicación se ofrece «tal cual», sin garantía de ningún tipo. El autor no se hace responsable de daños derivados del uso de la app, incluida la pérdida de las jugadas guardadas (puedes exportar tu libreta a JSON como copia de seguridad).',
      },
      { t: 'h', text: '8. Marcas de terceros' },
      {
        t: 'p',
        text: 'NFL FLAG, USA Flag y el resto de marcas citadas pertenecen a sus propietarios. Esta aplicación no está afiliada, patrocinada ni respaldada por la NFL ni por ninguna liga o federación.',
      },
    ],
  },
  {
    id: 'aviso-legal',
    title: 'Aviso legal',
    summary: 'Titular, condiciones de acceso y propiedad intelectual (LSSI-CE).',
    updated: LEGAL_UPDATED,
    blocks: [
      { t: 'h', text: '1. Datos del titular' },
      {
        t: 'p',
        text: 'En cumplimiento del artículo 10 de la Ley 34/2002 de Servicios de la Sociedad de la Información y de Comercio Electrónico (LSSI-CE), se informa de que el titular de esta aplicación y de su sitio web es César E. Frías Ramos, con correo de contacto kaesar10@gmail.com.',
      },
      { t: 'h', text: '2. Objeto' },
      {
        t: 'p',
        text: 'FlagPlays es una aplicación de dibujo y gestión de jugadas de flag football, de uso gratuito para los equipos de la federación andaluza de fútbol americano. La aplicación se distribuye como aplicación de escritorio para Windows y como aplicación Android, y su código puede solicitarse al titular.',
      },
      { t: 'h', text: '3. Condiciones de acceso y uso' },
      {
        t: 'p',
        text: 'El acceso a la app es libre y gratuito y no requiere registro. El usuario se compromete a hacer un uso adecuado de la aplicación y a no emplearla para fines ilícitos o contrarios a las presentes condiciones.',
      },
      { t: 'h', text: '4. Propiedad intelectual e industrial' },
      {
        t: 'p',
        text: 'El diseño de la aplicación, su código fuente, los textos, los iconos y el resto de elementos propios están protegidos por la normativa de propiedad intelectual. Las jugadas que crea el usuario son suyas. Las marcas y escudos de clubes o ligas citados pertenecen a sus respectivos titulares.',
      },
      {
        t: 'p',
        text: 'Se permite el uso personal y de equipo en los términos del apartado 2 de los Términos y condiciones. Queda prohibida la venta de la aplicación o su distribución comercial sin autorización escrita del titular.',
      },
      { t: 'h', text: '5. Exclusión de responsabilidad' },
      {
        t: 'p',
        text: 'El titular no garantiza la disponibilidad ininterrumpida de la aplicación ni la ausencia de errores. La aplicación se ofrece «tal cual» y el usuario la utiliza bajo su responsabilidad.',
      },
      { t: 'h', text: '6. Enlaces' },
      {
        t: 'p',
        text: 'La aplicación no incluye enlaces a sitios de terceros que recojan datos. Cualquier enlace externo que aparezca (por ejemplo, al repositorio del código) se rige por las condiciones del sitio de destino.',
      },
      { t: 'h', text: '7. Legislación aplicable y jurisdicción' },
      {
        t: 'p',
        text: 'Estas condiciones se rigen por la legislación española. Para cualquier controversia serán competentes los juzgados y tribunales que correspondan conforme a la ley aplicable.',
      },
    ],
  },
  {
    id: 'licencia',
    title: 'Licencia de uso y créditos',
    summary: 'Qué puedes hacer con la app, qué no, y de dónde salen sus contenidos.',
    updated: LEGAL_UPDATED,
    blocks: [
      { t: 'h', text: '1. Licencia de uso' },
      {
        t: 'p',
        text: 'Se concede a los equipos de flag inscritos en la federación andaluza de fútbol americano una licencia gratuita, no exclusiva e intransferible para instalar y usar FlagPlays, y para compartir la aplicación con otros equipos de la misma federación. El usuario conserva la propiedad de todas las jugadas que cree.',
      },
      { t: 'h', text: '2. Código libre' },
      {
        t: 'p',
        text: 'FlagPlays es software de código libre. Puedes solicitar el repositorio al creador y modificarlo para tu equipo. Si publicas una versión modificada, se agradece que mantengas la mención al autor original.',
      },
      { t: 'h', text: '3. Qué no se permite' },
      {
        t: 'ul',
        items: [
          'Vender la aplicación o cobrar por su distribución.',
          'Retirar los avisos de autoría.',
          'Usarla en equipos que no pertenezcan a la federación andaluza de fútbol americano.',
        ],
      },
      { t: 'h', text: '4. Créditos y contenidos de terceros' },
      {
        t: 'ul',
        items: [
          'Las métricas de las fuentes usadas al generar los PDF provienen de las métricas AFM públicas de Adobe.',
          'Los iconos y gráficos son propios, generados para la aplicación.',
          'Los nombres de jugadas del club que aparecen en el catálogo provienen de los playbooks del propio club.',
        ],
      },
      { t: 'h', text: '5. Contacto' },
      {
        t: 'p',
        text: 'Para pedir el repositorio, la app de móvil o plantear cualquier duda: kaesar10@gmail.com.',
      },
    ],
  },
  {
    id: 'datos-play',
    title: 'Seguridad de los datos (Google Play)',
    summary: 'Declaración de datos que se corresponde con lo que se publica en la ficha de Play.',
    updated: LEGAL_UPDATED,
    blocks: [
      { t: 'h', text: 'Resumen para la ficha de Play' },
      {
        t: 'ul',
        items: [
          '¿Se recopilan o comparten datos de usuario? No.',
          '¿Se cifran los datos en tránsito? No aplica: no hay transmisión de datos.',
          '¿Se pueden solicitar la eliminación de datos? No hay datos en servidores; los que guardas en tu dispositivo se borran desinstalando la app o desde los ajustes del sistema.',
          '¿Se comparten datos con terceros? No. No hay SDK de terceros, ni analítica, ni publicidad.',
          '¿Contiene anuncios? No.',
        ],
      },
      { t: 'h', text: 'Permisos declarados' },
      {
        t: 'ul',
        items: [
          'android.permission.WRITE_EXTERNAL_STORAGE (limitado a Android 9 o anterior): guardar las exportaciones en Descargas.',
          'android.permission.VIBRATE: aviso táctil al guardar.',
        ],
      },
      { t: 'h', text: 'Menores' },
      {
        t: 'p',
        text: 'No hay recogida de datos de ningún usuario, por lo que no hay tratamiento de datos de menores. El público objetivo de la ficha es de 13 años o más.',
      },
    ],
  },
];

/** Documento suelto por id. */
export function getLegalDoc(id) {
  return LEGAL_DOCS.find((doc) => doc.id === id) || null;
}

/** Texto plano de un documento (para copiar, buscar o generar documentos). */
export function legalDocToText(doc) {
  if (!doc) return '';
  const out = [doc.title, `Actualizado: ${doc.updated}`, ''];
  for (const block of doc.blocks) {
    if (block.t === 'h') out.push('', block.text, '');
    else if (block.t === 'p') out.push(block.text);
    else if (block.t === 'ul') for (const item of block.items) out.push(`- ${item}`);
    else if (block.t === 'note') out.push(`[${block.text}]`);
  }
  return out.join('\n');
}

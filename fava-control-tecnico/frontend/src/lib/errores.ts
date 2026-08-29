import type { Lang } from '../types';

/**
 * El código de error del servidor, en cristiano.
 *
 * POR QUE EXISTE. Hasta el 2026-08-29 las 35 pantallas que muestran un fallo pintaban
 * literalmente `«No se pudo guardar: SEMANA_NO_EDITABLE»`. El servidor tiene 87 códigos
 * y NINGUNO estaba traducido: el usuario leía el identificador interno y tenía que
 * adivinar qué hacer con él.
 *
 * TRES CAPAS, y la tercera es la que hace la promesa de que no vuelva a pasar:
 *
 *   1. El mapa exacto de abajo, código por código.
 *   2. Reglas de SUFIJO para las familias que el servidor construye al vuelo
 *      (`${'${campo}'}_INVALIDO`, `${'${campo}'}_REQUERIDO`, `TRANSICION_INVALIDA_X_A_Y`).
 *      Enumerarlas sería imposible: el campo sale de una variable.
 *   3. Un texto genérico con el código entre paréntesis. Nunca un código a secas.
 *
 * Vive aparte de `i18n.ts` (513 líneas ya) porque es un vocabulario distinto: aquello
 * son rótulos de pantalla, esto son respuestas del servidor.
 */

/** Lo que el usuario puede hacer al respecto, no lo que falló por dentro. */
const ES: Record<string, string> = {
  // ── La semana y sus notas ──
  SEMANA_VACIA: 'No hay ningún día registrado en esta semana. Registra al menos uno antes de enviarla.',
  SEMANA_YA_ENVIADA: 'Esta semana ya está enviada y no queda nada por mandar. Si necesitas corregir algo, pide a un administrador que te la devuelva.',
  PROYECTO_YA_APROBADO: 'Uno de los días nuevos es de un proyecto cuya nota ya está aprobada. Un administrador tiene que reabrirla antes de poder añadirle días.',
  JORNADA_BLOQUEADA: 'Ese día ya se envió y no se puede editar. Si hay que cambiarlo, pide que te devuelvan la semana.',
  NOTA_NO_ENCONTRADA: 'Esa nota ya no existe. Recarga la pantalla.',
  NOTA_NO_ENVIADA: 'La nota todavía no está enviada, así que aún no se puede firmar.',
  NOTA_YA_FIRMADA: 'Esta nota ya está firmada. Su PDF quedó congelado y no admite otra firma.',
  NOTA_FIRMADA: 'La nota ya está firmada y no admite cambios.',
  NOTA_FIRMADA_USAR_REOPEN: 'La nota está firmada: para corregirla hay que reabrirla, no devolverla.',
  NOTA_APROBADA: 'La nota ya está aprobada.',
  NOTA_SIN_FIRMA: 'No se puede aprobar una nota sin firmar. La firma es el consentimiento del técnico sobre lo que declaró, y sin ella tampoco queda un PDF que descargar. Pídele que la firme desde «Mi semana»; su botón «Firmar» sigue ahí.',
  NOTA_MODIFICADA: 'Alguien cambió esta nota mientras la tenías abierta. Recarga y vuelve a intentarlo.',
  PDF_NO_DISPONIBLE: 'Todavía no hay PDF firmado de esta nota.',
  COMENTARIO_REQUERIDO: 'Escribe el motivo: el técnico necesita saber qué corregir.',
  MOTIVO_REQUERIDO: 'Escribe el motivo de la reapertura.',
  RECIBO_NO_ENCONTRADO: 'Ese comprobante ya no está. Recarga la pantalla.',
  ARCHIVO_VACIO: 'El archivo llegó vacío. Vuelve a adjuntarlo.',
  ARCHIVO_DEMASIADO_GRANDE: 'El archivo pesa demasiado. Haz la foto con menos calidad o recórtala.',
  TIPO_NO_ADMITIDO: 'Solo se admiten imágenes y PDF.',

  // ── La bitácora ──
  DIAS_INVALIDOS: 'La lista de días no es válida.',
  DIAS_REPETIDOS: 'Hay un día repetido en la lista.',
  DEMASIADOS_DIAS: 'Como máximo se pueden rellenar siete días de una vez.',
  FECHA_INVALIDA: 'Esa fecha no es válida.',
  FECHA_EN_EL_CUERPO: 'La fecha va en la dirección, no en el cuerpo.',
  DESCRIPCION_INVALIDA: 'La descripción no es válida.',
  RANGO_INVALIDO: 'El rango de fechas no es válido.',
  USUARIO_SIN_TECNICO: 'Tu cuenta no está vinculada a ninguna ficha de técnico. Pídeselo a un administrador.',
  ORDEN_INEXISTENTE: 'Esa orden no existe.',
  ORDEN_DE_OTRO_PROYECTO: 'Esa orden es de otro proyecto.',
  CONCEPTO_INEXISTENTE: 'Ese concepto no existe en el catálogo.',

  // ── Proyectos y órdenes ──
  PROYECTO_NO_ENCONTRADO: 'Ese proyecto ya no existe. Recarga la pantalla.',
  ORDEN_NO_ENCONTRADA: 'Esa orden ya no existe. Recarga la pantalla.',
  COMMESSA_DUPLICADA: 'Ya hay una orden con esa commessa.',
  ORDEN_CON_BITACORA: 'No se puede borrar: esa orden ya tiene jornadas registradas.',
  ORDEN_CON_DIAS_VENDIDOS: 'No se puede borrar: esa orden ya tiene días vendidos.',
  MAQUINA_O_MONEDA_INEXISTENTE: 'La máquina o la moneda que elegiste ya no está en el catálogo.',
  REFERENCIA_INEXISTENTE: 'Algo de lo que elegiste ya no existe. Recarga la pantalla.',
  ROL_O_ORDEN_INEXISTENTE: 'El rol o la orden ya no existen. Recarga la pantalla.',
  RECURSO_APARTE: 'Ese dato se edita desde su propia pantalla.',
  CAMPO_CALCULADO_NO_ADMITIDO: 'Ese campo lo calcula el sistema y no se puede escribir a mano.',
  CAMPO_NO_ADMITIDO: 'Ese campo no se puede enviar aquí.',
  NADA_QUE_EDITAR: 'No cambiaste nada.',

  // ── Técnicos, usuarios y accesos ──
  TECNICO_NO_ENCONTRADO: 'Ese técnico ya no existe. Recarga la pantalla.',
  TECNICO_INEXISTENTE: 'Ese técnico no existe.',
  TECNICO_SIN_CORREO: 'Ese técnico no tiene correo, así que no hay a dónde mandarle la invitación. Añádeselo en su ficha y vuelve a intentarlo.',
  TECNICO_INACTIVO: 'Ese técnico está desactivado. Actívalo antes de darle acceso.',
  ROL_TECNICO_INEXISTENTE: 'Ese cargo no existe en el catálogo.',
  USUARIO_NO_ENCONTRADO: 'Ese usuario ya no existe. Recarga la pantalla.',
  EMAIL_YA_REGISTRADO: 'Ya hay un usuario con ese correo.',
  YA_EXISTE: 'Ya existe un registro con ese nombre.',
  NO_ENCONTRADO: 'Eso ya no existe. Recarga la pantalla.',
  SOLICITUD_NO_ENCONTRADA: 'Esa solicitud ya no existe.',
  SOLICITUD_YA_RESUELTA: 'Esa solicitud ya la resolvió alguien.',
  YA_TIENES_ACCESO: 'Ya tienes acceso: no hace falta pedirlo.',
  DEBE_QUEDAR_UN_SUPER_ADMIN: 'Tiene que quedar al menos un Super Admin activo.',
  NO_PUEDES_QUITARTE_SUPER_ADMIN: 'No puedes quitarte a ti mismo el rol de Super Admin.',
  SOLO_SUPER_ADMIN_ASIGNA_ADMIN: 'Solo un Super Admin puede dar el rol de administrador.',
  SOLO_SUPER_ADMIN_DESACTIVA_ADMINS: 'Solo un Super Admin puede desactivar a un administrador.',
  CODIGO_NO_EDITABLE: 'El código de un concepto no se puede cambiar.',

  // ── Los pone el cliente, no el servidor ──
  ERROR_DE_RED: 'No se pudo hablar con el servidor. Revisa la conexión y vuelve a intentarlo; lo que hayas escrito sigue aquí.',
  RUTA_NO_ENCONTRADA: 'Esa dirección ya no existe en el servidor. Recarga la página: puede que haya salido una versión nueva mientras la tenías abierta.',
  RESPUESTA_INESPERADA: 'El servidor respondió algo que la aplicación no entiende. Vuelve a intentarlo; si sigue igual, recarga la página.',

  // ── Sesión y permisos ──
  CREDENCIALES_INVALIDAS: 'Correo o contraseña incorrectos.',
  TOKEN_AUSENTE: 'Tu sesión no llegó al servidor. Vuelve a entrar.',
  TOKEN_INVALIDO: 'Tu sesión caducó. Vuelve a entrar.',
  TOKEN_SIN_OID: 'Tu sesión no trae identidad. Vuelve a entrar.',
  TENANT_AJENO: 'Esa cuenta no es de la organización de FAVA.',
  SCOPE_INSUFICIENTE: 'Tu sesión no tiene permiso para esta operación. Vuelve a entrar.',
  SIN_ACCESO: 'No tienes acceso a esta aplicación.',
  ROL_INSUFICIENTE: 'Tu rol no permite hacer esto.',
};

const IT: Record<string, string> = {
  SEMANA_VACIA: 'Non c’è nessun giorno registrato in questa settimana. Registrane almeno uno prima di inviarla.',
  SEMANA_YA_ENVIADA: 'Questa settimana è già stata inviata e non resta nulla da mandare. Se devi correggere qualcosa, chiedi a un amministratore di restituirtela.',
  PROYECTO_YA_APROBADO: 'Uno dei giorni nuovi appartiene a un progetto la cui nota è già approvata. Un amministratore deve riaprirla prima di aggiungerle giorni.',
  JORNADA_BLOQUEADA: 'Quel giorno è già stato inviato e non si può modificare. Se va cambiato, chiedi che ti restituiscano la settimana.',
  NOTA_NO_ENCONTRADA: 'Quella nota non esiste più. Ricarica la schermata.',
  NOTA_NO_ENVIADA: 'La nota non è ancora stata inviata, quindi non si può firmare.',
  NOTA_YA_FIRMADA: 'Questa nota è già firmata. Il suo PDF è stato congelato e non ammette un’altra firma.',
  NOTA_FIRMADA: 'La nota è già firmata e non ammette modifiche.',
  NOTA_FIRMADA_USAR_REOPEN: 'La nota è firmata: per correggerla va riaperta, non restituita.',
  NOTA_APROBADA: 'La nota è già approvata.',
  NOTA_SIN_FIRMA: 'Non si può approvare una nota non firmata. La firma è il consenso del tecnico su ciò che ha dichiarato, e senza di essa non resta nemmeno un PDF da scaricare. Chiedigli di firmarla da «La mia settimana»: il pulsante «Firma» è ancora lì.',
  NOTA_MODIFICADA: 'Qualcuno ha modificato questa nota mentre la tenevi aperta. Ricarica e riprova.',
  PDF_NO_DISPONIBLE: 'Non c’è ancora un PDF firmato di questa nota.',
  COMENTARIO_REQUERIDO: 'Scrivi il motivo: il tecnico deve sapere cosa correggere.',
  MOTIVO_REQUERIDO: 'Scrivi il motivo della riapertura.',
  RECIBO_NO_ENCONTRADO: 'Quel giustificativo non c’è più. Ricarica la schermata.',
  ARCHIVO_VACIO: 'Il file è arrivato vuoto. Allegalo di nuovo.',
  ARCHIVO_DEMASIADO_GRANDE: 'Il file è troppo pesante. Scatta la foto con meno qualità o ritagliala.',
  TIPO_NO_ADMITIDO: 'Si accettano solo immagini e PDF.',

  DIAS_INVALIDOS: 'L’elenco dei giorni non è valido.',
  DIAS_REPETIDOS: 'C’è un giorno ripetuto nell’elenco.',
  DEMASIADOS_DIAS: 'Si possono compilare al massimo sette giorni per volta.',
  FECHA_INVALIDA: 'Quella data non è valida.',
  FECHA_EN_EL_CUERPO: 'La data va nell’indirizzo, non nel corpo.',
  DESCRIPCION_INVALIDA: 'La descrizione non è valida.',
  RANGO_INVALIDO: 'L’intervallo di date non è valido.',
  USUARIO_SIN_TECNICO: 'Il tuo account non è collegato a nessuna scheda tecnico. Chiedilo a un amministratore.',
  ORDEN_INEXISTENTE: 'Quella commessa non esiste.',
  ORDEN_DE_OTRO_PROYECTO: 'Quella commessa è di un altro progetto.',
  CONCEPTO_INEXISTENTE: 'Quel concetto non esiste nel catalogo.',

  PROYECTO_NO_ENCONTRADO: 'Quel progetto non esiste più. Ricarica la schermata.',
  ORDEN_NO_ENCONTRADA: 'Quella commessa non esiste più. Ricarica la schermata.',
  COMMESSA_DUPLICADA: 'Esiste già una commessa con quel numero.',
  ORDEN_CON_BITACORA: 'Non si può eliminare: quella commessa ha già giornate registrate.',
  ORDEN_CON_DIAS_VENDIDOS: 'Non si può eliminare: quella commessa ha già giorni venduti.',
  MAQUINA_O_MONEDA_INEXISTENTE: 'La macchina o la valuta che hai scelto non è più nel catalogo.',
  REFERENCIA_INEXISTENTE: 'Qualcosa che hai scelto non esiste più. Ricarica la schermata.',
  ROL_O_ORDEN_INEXISTENTE: 'Il ruolo o la commessa non esistono più. Ricarica la schermata.',
  RECURSO_APARTE: 'Quel dato si modifica dalla sua schermata.',
  CAMPO_CALCULADO_NO_ADMITIDO: 'Quel campo lo calcola il sistema e non si scrive a mano.',
  CAMPO_NO_ADMITIDO: 'Quel campo non si può inviare qui.',
  NADA_QUE_EDITAR: 'Non hai cambiato nulla.',

  TECNICO_NO_ENCONTRADO: 'Quel tecnico non esiste più. Ricarica la schermata.',
  TECNICO_INEXISTENTE: 'Quel tecnico non esiste.',
  TECNICO_SIN_CORREO: 'Quel tecnico non ha email, quindi non c’è dove mandare l’invito. Aggiungila alla sua scheda e riprova.',
  TECNICO_INACTIVO: 'Quel tecnico è disattivato. Attivalo prima di dargli accesso.',
  ROL_TECNICO_INEXISTENTE: 'Quel ruolo non esiste nel catalogo.',
  USUARIO_NO_ENCONTRADO: 'Quell’utente non esiste più. Ricarica la schermata.',
  EMAIL_YA_REGISTRADO: 'C’è già un utente con quella email.',
  YA_EXISTE: 'Esiste già un record con quel nome.',
  NO_ENCONTRADO: 'Non esiste più. Ricarica la schermata.',
  SOLICITUD_NO_ENCONTRADA: 'Quella richiesta non esiste più.',
  SOLICITUD_YA_RESUELTA: 'Quella richiesta è già stata risolta.',
  YA_TIENES_ACCESO: 'Hai già accesso: non serve chiederlo.',
  DEBE_QUEDAR_UN_SUPER_ADMIN: 'Deve restare almeno un Super Admin attivo.',
  NO_PUEDES_QUITARTE_SUPER_ADMIN: 'Non puoi togliere a te stesso il ruolo di Super Admin.',
  SOLO_SUPER_ADMIN_ASIGNA_ADMIN: 'Solo un Super Admin può assegnare il ruolo di amministratore.',
  SOLO_SUPER_ADMIN_DESACTIVA_ADMINS: 'Solo un Super Admin può disattivare un amministratore.',
  CODIGO_NO_EDITABLE: 'Il codice di un concetto non si può cambiare.',

  ERROR_DE_RED: 'Impossibile contattare il server. Controlla la connessione e riprova; quello che hai scritto resta qui.',
  RUTA_NO_ENCONTRADA: 'Quell’indirizzo non esiste più sul server. Ricarica la pagina: potrebbe essere uscita una versione nuova mentre la tenevi aperta.',
  RESPUESTA_INESPERADA: 'Il server ha risposto qualcosa che l’applicazione non capisce. Riprova; se continua, ricarica la pagina.',

  CREDENCIALES_INVALIDAS: 'Email o password errate.',
  TOKEN_AUSENTE: 'La tua sessione non è arrivata al server. Rientra.',
  TOKEN_INVALIDO: 'La tua sessione è scaduta. Rientra.',
  TOKEN_SIN_OID: 'La tua sessione non porta identità. Rientra.',
  TENANT_AJENO: 'Quell’account non appartiene all’organizzazione FAVA.',
  SCOPE_INSUFICIENTE: 'La tua sessione non ha il permesso per questa operazione. Rientra.',
  SIN_ACCESO: 'Non hai accesso a questa applicazione.',
  ROL_INSUFICIENTE: 'Il tuo ruolo non permette di farlo.',
};

const PT: Record<string, string> = {
  SEMANA_VACIA: 'Não há nenhum dia registrado nesta semana. Registre pelo menos um antes de enviá-la.',
  SEMANA_YA_ENVIADA: 'Esta semana já foi enviada e não resta nada a mandar. Se precisar corrigir algo, peça a um administrador que a devolva.',
  PROYECTO_YA_APROBADO: 'Um dos dias novos é de um projeto cuja nota já está aprovada. Um administrador precisa reabri-la antes de acrescentar dias.',
  JORNADA_BLOQUEADA: 'Esse dia já foi enviado e não pode ser editado. Se precisa mudar, peça que devolvam a semana.',
  NOTA_NO_ENCONTRADA: 'Essa nota não existe mais. Recarregue a tela.',
  NOTA_NO_ENVIADA: 'A nota ainda não foi enviada, então não dá para assinar.',
  NOTA_YA_FIRMADA: 'Esta nota já está assinada. O PDF foi congelado e não aceita outra assinatura.',
  NOTA_FIRMADA: 'A nota já está assinada e não aceita alterações.',
  NOTA_FIRMADA_USAR_REOPEN: 'A nota está assinada: para corrigir é preciso reabri-la, não devolvê-la.',
  NOTA_APROBADA: 'A nota já está aprovada.',
  NOTA_SIN_FIRMA: 'Não dá para aprovar uma nota sem assinatura. A assinatura é o consentimento do técnico sobre o que declarou, e sem ela também não fica um PDF para baixar. Peça que ele assine em «Minha semana»; o botão «Assinar» continua lá.',
  NOTA_MODIFICADA: 'Alguém alterou esta nota enquanto estava aberta. Recarregue e tente de novo.',
  PDF_NO_DISPONIBLE: 'Ainda não há PDF assinado desta nota.',
  COMENTARIO_REQUERIDO: 'Escreva o motivo: o técnico precisa saber o que corrigir.',
  MOTIVO_REQUERIDO: 'Escreva o motivo da reabertura.',
  RECIBO_NO_ENCONTRADO: 'Esse comprovante não está mais lá. Recarregue a tela.',
  ARCHIVO_VACIO: 'O arquivo chegou vazio. Anexe de novo.',
  ARCHIVO_DEMASIADO_GRANDE: 'O arquivo está muito pesado. Tire a foto com menos qualidade ou recorte.',
  TIPO_NO_ADMITIDO: 'Só são aceitas imagens e PDF.',

  DIAS_INVALIDOS: 'A lista de dias não é válida.',
  DIAS_REPETIDOS: 'Há um dia repetido na lista.',
  DEMASIADOS_DIAS: 'No máximo sete dias de uma vez.',
  FECHA_INVALIDA: 'Essa data não é válida.',
  FECHA_EN_EL_CUERPO: 'A data vai no endereço, não no corpo.',
  DESCRIPCION_INVALIDA: 'A descrição não é válida.',
  RANGO_INVALIDO: 'O intervalo de datas não é válido.',
  USUARIO_SIN_TECNICO: 'Sua conta não está vinculada a nenhuma ficha de técnico. Peça a um administrador.',
  ORDEN_INEXISTENTE: 'Essa ordem não existe.',
  ORDEN_DE_OTRO_PROYECTO: 'Essa ordem é de outro projeto.',
  CONCEPTO_INEXISTENTE: 'Esse conceito não existe no catálogo.',

  PROYECTO_NO_ENCONTRADO: 'Esse projeto não existe mais. Recarregue a tela.',
  ORDEN_NO_ENCONTRADA: 'Essa ordem não existe mais. Recarregue a tela.',
  COMMESSA_DUPLICADA: 'Já existe uma ordem com essa commessa.',
  ORDEN_CON_BITACORA: 'Não dá para apagar: essa ordem já tem jornadas registradas.',
  ORDEN_CON_DIAS_VENDIDOS: 'Não dá para apagar: essa ordem já tem dias vendidos.',
  MAQUINA_O_MONEDA_INEXISTENTE: 'A máquina ou a moeda que você escolheu não está mais no catálogo.',
  REFERENCIA_INEXISTENTE: 'Algo que você escolheu não existe mais. Recarregue a tela.',
  ROL_O_ORDEN_INEXISTENTE: 'O cargo ou a ordem não existem mais. Recarregue a tela.',
  RECURSO_APARTE: 'Esse dado se edita na tela dele.',
  CAMPO_CALCULADO_NO_ADMITIDO: 'Esse campo é calculado pelo sistema e não se escreve à mão.',
  CAMPO_NO_ADMITIDO: 'Esse campo não pode ser enviado aqui.',
  NADA_QUE_EDITAR: 'Você não mudou nada.',

  TECNICO_NO_ENCONTRADO: 'Esse técnico não existe mais. Recarregue a tela.',
  TECNICO_INEXISTENTE: 'Esse técnico não existe.',
  TECNICO_SIN_CORREO: 'Esse técnico não tem e-mail, então não há para onde mandar o convite. Adicione na ficha dele e tente de novo.',
  TECNICO_INACTIVO: 'Esse técnico está desativado. Ative antes de dar acesso.',
  ROL_TECNICO_INEXISTENTE: 'Esse cargo não existe no catálogo.',
  USUARIO_NO_ENCONTRADO: 'Esse usuário não existe mais. Recarregue a tela.',
  EMAIL_YA_REGISTRADO: 'Já existe um usuário com esse e-mail.',
  YA_EXISTE: 'Já existe um registro com esse nome.',
  NO_ENCONTRADO: 'Isso não existe mais. Recarregue a tela.',
  SOLICITUD_NO_ENCONTRADA: 'Essa solicitação não existe mais.',
  SOLICITUD_YA_RESUELTA: 'Essa solicitação já foi resolvida.',
  YA_TIENES_ACCESO: 'Você já tem acesso: não precisa pedir.',
  DEBE_QUEDAR_UN_SUPER_ADMIN: 'Precisa restar ao menos um Super Admin ativo.',
  NO_PUEDES_QUITARTE_SUPER_ADMIN: 'Você não pode tirar de si mesmo o papel de Super Admin.',
  SOLO_SUPER_ADMIN_ASIGNA_ADMIN: 'Só um Super Admin pode dar o papel de administrador.',
  SOLO_SUPER_ADMIN_DESACTIVA_ADMINS: 'Só um Super Admin pode desativar um administrador.',
  CODIGO_NO_EDITABLE: 'O código de um conceito não pode ser alterado.',

  ERROR_DE_RED: 'Não foi possível falar com o servidor. Verifique a conexão e tente de novo; o que você escreveu continua aqui.',
  RUTA_NO_ENCONTRADA: 'Esse endereço não existe mais no servidor. Recarregue a página: pode ter saído uma versão nova enquanto estava aberta.',
  RESPUESTA_INESPERADA: 'O servidor respondeu algo que o aplicativo não entende. Tente de novo; se continuar, recarregue a página.',

  CREDENCIALES_INVALIDAS: 'E-mail ou senha incorretos.',
  TOKEN_AUSENTE: 'Sua sessão não chegou ao servidor. Entre de novo.',
  TOKEN_INVALIDO: 'Sua sessão expirou. Entre de novo.',
  TOKEN_SIN_OID: 'Sua sessão não traz identidade. Entre de novo.',
  TENANT_AJENO: 'Essa conta não é da organização da FAVA.',
  SCOPE_INSUFICIENTE: 'Sua sessão não tem permissão para esta operação. Entre de novo.',
  SIN_ACCESO: 'Você não tem acesso a este aplicativo.',
  ROL_INSUFICIENTE: 'Seu cargo não permite fazer isso.',
};

const MAPAS: Record<Lang, Record<string, string>> = { es: ES, it: IT, pt: PT };

/**
 * Las familias que el servidor arma al vuelo y que NO se pueden enumerar: el nombre del
 * campo sale de una variable (`${'${campo}'}_INVALIDO` en catalogs, orders y weekly-notes).
 * Se reconocen por el sufijo y se explican por lo que son, sin fingir que sabemos cuál.
 */
const GENERICOS: Record<Lang, { transicion: string; requerido: string; invalido: string; otro: string }> = {
  es: {
    transicion: 'El estado de la nota cambió mientras la tenías abierta. Recarga y vuelve a intentarlo.',
    requerido: 'Falta un dato obligatorio.',
    invalido: 'Hay un dato que no es válido.',
    otro: 'No se pudo completar la operación.',
  },
  it: {
    transicion: 'Lo stato della nota è cambiato mentre la tenevi aperta. Ricarica e riprova.',
    requerido: 'Manca un dato obbligatorio.',
    invalido: 'C’è un dato non valido.',
    otro: 'Non è stato possibile completare l’operazione.',
  },
  pt: {
    transicion: 'O estado da nota mudou enquanto estava aberta. Recarregue e tente de novo.',
    requerido: 'Falta um dado obrigatório.',
    invalido: 'Há um dado que não é válido.',
    otro: 'Não foi possível completar a operação.',
  },
};

/** `SEMANA_NO_EDITABLE` -> `semana no editable`: legible aunque no esté traducido. */
const legible = (codigo: string) => codigo.toLowerCase().replace(/_/g, ' ');

/**
 * El texto que se le enseña a una persona. NUNCA devuelve el código a secas: si no lo
 * conoce, da la frase genérica y deja el código entre paréntesis para poder reportarlo.
 */
export function textoError(codigo: string, lang: Lang): string {
  const mapa = MAPAS[lang] ?? ES;
  const exacto = mapa[codigo] ?? ES[codigo];
  if (exacto) return exacto;

  const g = GENERICOS[lang] ?? GENERICOS.es;
  if (codigo.startsWith('TRANSICION_INVALIDA')) return g.transicion;
  if (/_REQUERID[OA]$/.test(codigo)) return `${g.requerido} (${legible(codigo.replace(/_REQUERID[OA]$/, ''))})`;
  if (/_INVALID[OA]S?$/.test(codigo)) return `${g.invalido} (${legible(codigo.replace(/_INVALID[OA]S?$/, ''))})`;
  // Un mensaje del servidor que no es un código (una lista de validación, por ejemplo)
  // ya viene en cristiano: se muestra tal cual en vez de taparlo con el genérico.
  if (!/^[A-Z0-9_]+$/.test(codigo)) return codigo;
  return `${g.otro} (${legible(codigo)})`;
}

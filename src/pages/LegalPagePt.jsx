import { APP_NAME, COMPANY_NAME, CONTACT_EMAIL, LEGAL_LAST_UPDATED, SENTRY_DSN } from '../config'

// Versão portuguesa do aviso de privacidade e dos termos da beta.
// Manter alinhada com as versões em inglês em LegalPage.jsx.

function Contacto() {
  if (!CONTACT_EMAIL) return <>através da pessoa que o convidou para o {APP_NAME}</>
  return <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'var(--accent-text)' }}>{CONTACT_EMAIL}</a>
}

export function PrivacyPt() {
  return (
    <>
      <h1>Aviso de privacidade</h1>
      <p className="meta">Última atualização: {LEGAL_LAST_UPDATED}</p>

      <h2>Quem somos</h2>
      <p>O {APP_NAME} é gerido pela {COMPANY_NAME} (Portugal), responsável pelo tratamento dos dados pessoais aqui descritos. Contacte-nos <Contacto />.</p>

      <h2>Que dados recolhemos</h2>
      <ul>
        <li><strong>Conta:</strong> o seu email, nome, número de telemóvel (opcional) e palavra-passe (guardada apenas como hash seguro pelo nosso fornecedor de autenticação) e, se ativar o início de sessão em dois passos, a chave que a sua aplicação autenticadora partilha com ele.</li>
        <li><strong>Dados de trabalho que você ou a sua equipa adicionam:</strong> organizações, eventos, a sua função, horas de chamada e de marcação, datas que indica como indisponíveis, perguntas de disponibilidade que recebe e as suas respostas, ficheiros que carrega e atualizações que publica. Outras empresas só veem que está "marcado" num período, nunca onde.</li>
        <li><strong>Dados técnicos:</strong> horas de início de sessão e, nos registos de segurança dos nossos fornecedores, o endereço IP e o tipo de navegador.</li>
        <li><strong>Contagens de utilização:</strong> quantas vezes cada ecrã ou funcionalidade é usado por dia, somando todos os utilizadores. Estas contagens não têm nome, email, identificador de conta, endereço IP nem identificador do dispositivo, por isso não podem ser associadas a si.</li>
        <li><strong>Destinatários de orçamentos:</strong> se uma empresa lhe enviar um orçamento através do {APP_NAME}, guardamos os contactos que ela indicou e, se responder, o seu nome, a sua mensagem e a data da resposta.</li>
        <li><strong>Clientes e fornecedores que escrevem através de uma ligação:</strong> se escrever a uma empresa na página de um orçamento ou através de uma ligação de aluguer externo que ela lhe enviou, guardamos o nome que indicar e as suas mensagens. Só os administradores e membros dessa empresa as veem. São apagadas quando a empresa apagar o orçamento ou o aluguer externo, ou a sua organização.</li>
        <li><strong>Dados de contacto de clientes e fornecedores:</strong> uma empresa pode guardar nos seus Contactos os nomes, endereços de e-mail, telefones, moradas e NIF dos seus clientes e fornecedores, escritos ou importados dos seus ficheiros. Só os administradores e membros dessa empresa os veem; a empresa pode alterá-los ou limpar os dados, e são apagados com a sua organização.</li>
        <li><strong>Pessoas importadas antes de serem convidadas:</strong> quando uma empresa importa a sua equipa de outra ferramenta, guardamos os nomes, endereços de e-mail, telefones e funções que importa até um administrador enviar ou descartar os convites, como registo do que foi enviado. A importação em si não envia e-mails a ninguém. São apagados com a organização.</li>
        <li><strong>Perfil profissional:</strong> só se o ligar. Tem o que decidir pôr nele: o que faz, a sua localidade (com uma precisão de cerca de 1 km, nunca a morada), até onde se desloca, línguas, anos de experiência, certificados que declara, um texto curto e ligações. Escolhe quem o vê: só administradores e membros de empresas no AVX, ou também outras pessoas no AVX; nunca aparece na internet pública e as pessoas que bloqueou nunca o veem. Não se guardam preços. Para encontrar a sua localidade enviamos o nome que escreve (mais nada sobre si) à pesquisa de locais do OpenStreetMap, através do nosso servidor. Os administradores e membros das empresas (e outros técnicos, se assim escolheu) encontram-no em "Procurar técnicos" por função, local, datas e língua; veem se está livre nas datas que pesquisam, nunca em que eventos está, e a que distância está em quilómetros inteiros, nunca onde exatamente. Quando uma empresa o contacta a partir daí (uma pergunta sobre a sua disponibilidade ou a oferta de um lugar), guardamos o registo de quem o contactou, de que empresa e quando, e passam a poder escrever um ao outro. Contamos as pesquisas e os primeiros contactos de cada empresa para evitar abusos. Pode mudá-lo, desligá-lo ou removê-lo a qualquer momento; é apagado com a sua conta.</li>
        <li><strong>Vagas:</strong> quando uma empresa publica uma vaga, guardamos o que escreveu (título, função, datas, localidade, línguas, certificado, descrição e pagamento) e quem a publicou; os freelancers com o perfil profissional ligado veem-na com o nome da empresa, nunca o nome do evento nem o cliente. Quando se candidata, a empresa vê a candidatura (a sua mensagem e, se o pedir, o seu preço por dia) com o seu perfil profissional, e começa uma conversa entre si e quem publicou. Guardamos a candidatura e a resposta (lista final, recusada, oferta, aceite) para que ambos vejam em que ponto está. As candidaturas são contadas por dia para evitar abusos. É apagado com a sua conta.</li>
        <li><strong>Alertas e pesquisas guardadas:</strong> quando uma empresa publica uma vaga que se ajusta ao seu perfil profissional (as suas funções e até onde se desloca), avisamos na aplicação, por notificação push se a ativou, e no resumo por e-mail; no máximo 10 por dia, nunca de empresas que bloqueou ou que o bloquearam. Pode desativar os alertas de vagas no seu perfil profissional. Os administradores e membros de uma empresa podem guardar os filtros de "Procurar técnicos" com um nome; com alertas ativos, quem a guardou é avisado quando é ativado um perfil profissional que se ajusta, se o puder ver. As pesquisas guardadas pertencem à empresa e são mantidas até serem removidas ou a empresa ser eliminada.</li>
        <li><strong>Confiança na rede de equipas:</strong> um administrador da organização pode validar o número de IVA da empresa na UE: enviamos o país e o número (nada mais) ao serviço VIES da Comissão Europeia e guardamos a resposta, incluindo o nome e a morada registados que devolve; o nome registado aparece junto ao selo de "verificada" da empresa. Fora da UE, o administrador pode pedir-nos uma verificação manual e guardamos o que escreveu e a nossa resposta. No seu perfil profissional, uma empresa que já o teve num dos seus eventos pode confirmar um certificado (o nome dela aparece junto ao certificado), e pode carregar um comprovativo de um certificado: só os administradores da própria AVX veem esse ficheiro, para o verificar; as empresas só veem que foi verificado. Se denunciar um perfil profissional ou uma vaga, guardamos a denúncia (motivo, nota, quem e quando) para os administradores da AVX; a pessoa ou empresa não sabe quem denunciou. Três denúncias de pessoas diferentes ocultam um perfil, ou põem em pausa as vagas de uma empresa, até um administrador da AVX analisar. Pode escolher ser contactado apenas por empresas com quem já trabalhou. Numa conversa direta com alguém com quem não partilha evento nem organização, só é possível enviar ficheiros depois de essa pessoa responder.</li>
        <li><strong>Ligação do calendário:</strong> se a pedir, guardamos uma chave aleatória para a sua ligação privada de calendário. O calendário do seu telemóvel usa-a para ler os nomes, datas, locais, papel e hora de chamada dos eventos em que está, e registamos quando foi usada pela última vez. Pode substituí-la quando quiser; é apagada com a sua conta.</li>
        <li><strong>Tarefas:</strong> as tarefas de um evento ou de uma organização guardam o que alguém escreveu (título, notas, uma lista de verificação), para quem são, quando devem estar feitas e quem as marcou como feitas. As tarefas de um evento são vistas por todos nesse evento; as da organização, pelos seus administradores e membros. As tarefas removidas ficam ocultas e são apagadas com o evento ou a organização.</li>
        <li><strong>Valores e cachês:</strong> uma empresa pode guardar o que paga por função ou por pessoa e o cachê combinado consigo num evento. Os seus valores só são vistos pelos seus administradores e membros; o seu cachê num evento é visto por quem gere esse evento e por si, nunca pelo resto da equipa. Estão incluídos na exportação da organização e são apagados com o evento ou a organização.</li>
        <li><strong>Registos do equipamento:</strong> as reparações e inspeções de uma empresa podem indicar quem comunicou um problema, o técnico de reparação ou o inspetor, com notas e fotos. Só os seus administradores e membros os veem; são apagados com a organização.</li>
        <li><strong>Campos próprios de uma empresa:</strong> uma empresa pode acrescentar os seus próprios campos aos seus eventos, clientes, fornecedores e equipamento e preenchê-los. Quem pode ver o registo vê-os (os campos de um evento são vistos por todos nesse evento); estão incluídos na exportação da organização e são apagados com ela. As empresas não devem usá-los para dados pessoais sensíveis, como dados de saúde.</li>
        <li><strong>Notificações nos seus dispositivos:</strong> se as ativar, guardamos para cada telemóvel ou computador o endereço que o serviço de notificações do navegador lhe deu, as chaves que cifram as notificações para ele e um nome do dispositivo (como "Chrome · Android"). Desativá-las, ou terminar a sessão nesse dispositivo, faz com que deixem de chegar.</li>
      </ul>
      <p>Não usamos publicidade, cookies de seguimento nem perfis de análise. O seu navegador guarda localmente um token de sessão para que não tenha de voltar a entrar — é estritamente necessário para o serviço. As mensagens que escreve sem ligação ficam guardadas no seu navegador até serem enviadas; terminar a sessão apaga-as.</p>

      <h2>Para que os usamos</h2>
      <ul>
        <li>Para lhe prestar o {APP_NAME} a si e à sua organização (execução de contrato).</li>
        <li>Para manter o serviço seguro, prevenir abusos e corrigir erros (interesse legítimo).</li>
        <li>Para enviar emails: confirmações de conta, recuperação de palavra-passe, convites, o resumo diário opcional das suas notificações e os orçamentos que uma empresa envia aos seus clientes.</li>
      </ul>

      <h2>Quem os trata por nós</h2>
      <ul>
        <li><strong>Supabase</strong> — base de dados, autenticação e armazenamento de ficheiros, alojados em Zurique, Suíça (país reconhecido pela UE como tendo proteção adequada).</li>
        <li><strong>Vercel</strong> — serve as páginas da aplicação; pode tratar o seu endereço IP na sua rede global ao abrigo de Cláusulas Contratuais-Tipo da UE.</li>
        <li><strong>Brevo</strong> (Sendinblue SAS, França, UE) — envia os nossos emails: emails da conta, convites, o resumo diário e orçamentos. Recebe o endereço de email do destinatário e o conteúdo do email.</li>
        <li><strong>O serviço de notificações do seu navegador</strong> (Google no Chrome e Android, Apple no Safari e iPhone, Mozilla no Firefox, Microsoft no Edge) — só se ativar as notificações num dispositivo: entrega cada notificação a esse dispositivo. O texto é cifrado para o seu dispositivo, por isso o serviço de notificações não o consegue ler.</li>
        {SENTRY_DSN && <li><strong>Sentry</strong> — recebe relatórios de erros (sem conteúdo de ficheiros nem endereço IP; é identificado apenas por um identificador interno).</li>}
      </ul>
      <p>Não vendemos os seus dados nem os partilhamos com terceiros, exceto quando a lei o exija.</p>

      <h2>Quem vê os seus dados no {APP_NAME}</h2>
      <p>Os membros de uma organização veem os seus eventos, ficheiros e atualizações, e os nomes e emails uns dos outros. Quem é adicionado a um evento vê esse evento, o horário, a lista da equipa (nomes, funções, horas de chamada e telemóveis, se indicados), os ficheiros, as atualizações e o registo de alterações.</p>
      <p><strong>Encontrar quem já trabalhou consigo:</strong> ao adicionar alguém a um evento ou organização, quem adiciona pode pesquisar pelo nome entre as pessoas com quem já partilhou um evento ou organização, e ver as funções que essas pessoas tiveram nesses eventos, quantos eventos partilharam e se estão reservadas noutro sítio nas datas do novo evento (sem dizer onde). Ninguém pode pesquisar toda a gente no {APP_NAME}, e os emails não são mostrados. Em Conta escolhe quem o pode encontrar assim: <strong>só gestores e administradores</strong> (as pessoas das próprias empresas; é o valor por defeito) ou <strong>também outros técnicos</strong>.</p>
      <p><strong>Notas de ensaio:</strong> as notas escritas durante um ensaio de um evento (o momento que marcam, departamento, prioridade, cue, texto, uma foto opcional, quem a escreveu, para quem é e quando foi marcada como feita) são mostradas a todos os que podem ver esse evento. As fotos são guardadas de forma privada e só eles as podem abrir. O ditado usa o reconhecimento de voz do seu navegador, que pode enviar o áudio ao respetivo fabricante (Google no Chrome, Apple no Safari); o AVX só recebe o texto. Para acertar o relógio do ensaio, a câmara pode ler um ecrã de timecode e o microfone pode ouvir um sinal LTC: ambos são lidos no seu dispositivo, e nenhuma imagem ou som é enviado ou guardado. As notas escritas sem ligação ficam no seu dispositivo até serem enviadas. Notas e sessões removidas ficam ocultas e são apagadas com o evento.</p>
      <p><strong>Mensagens:</strong> as mensagens que envia são guardadas e mostradas às pessoas dessa conversa: a outra pessoa numa conversa direta, ou toda a gente que pode ver o evento no respetivo canal (incluindo quem for adicionado ao evento mais tarde). Só pode iniciar uma conversa com pessoas com quem partilha um evento ou organização. Não há confirmações de leitura: ninguém vê se ou quando leu uma mensagem. Os ficheiros que anexa são guardados de forma privada e só podem ser abertos pelas pessoas dessa conversa. Pode editar as suas mensagens (as pessoas da conversa podem ver as versões anteriores) ou apagá-las: apagar remove o texto, os ficheiros e as versões anteriores para todos. Os canais de uma organização são visíveis para a parte da organização que os administradores escolhem (todos, administradores e membros, ou só administradores); os canais de departamento de um evento são visíveis para quem tem essa função no evento e para a sua produção. Os avisos pedem-lhe que confirme que leu: quem enviou o aviso e quem gere esse canal veem quem confirmou e quando. As mensagens que guarda para depois só são visíveis para si. As perguntas de disponibilidade e as chamadas de equipa (ofertas de um lugar num evento) são publicadas na sua conversa direta com quem as enviou, juntamente com a sua resposta; aceitar uma chamada de equipa adiciona-o a esse evento. Quando o horário de um evento muda, é publicada uma nota curta no respetivo canal. Os administradores e membros de uma organização podem falar sobre um equipamento, uma reparação ou um aluguer externo numa conversa que só eles veem. A pesquisa só procura em conversas que já pode ler. As mensagens que enviou estão incluídas na exportação dos seus dados. O resumo por email pode citar o início de uma mensagem enviada para si, que o mencione ou de um aviso.</p>
      <p><strong>Denúncias e bloqueios:</strong> pode denunciar uma mensagem. Numa conversa de um evento ou de uma organização, quem a gere (a produção do evento ou os administradores da organização) vê a mensagem, o motivo e quantas pessoas a denunciaram, nunca quem; pode removê-la para todos, e o autor é avisado de que um moderador a removeu. As denúncias em conversas diretas vão para a equipa do {APP_NAME}. Guardamos cada denúncia (quem a fez, o motivo e o que foi decidido) para lidar com abusos. Pode bloquear uma pessoa: nenhum de vocês pode então escrever na vossa conversa direta e as menções e respostas dessa pessoa deixam de o notificar; ela não é avisada, mas verá que as mensagens não são entregues. Para travar spam, cada pessoa pode enviar no máximo 20 mensagens por minuto.</p>

      <h2>Durante quanto tempo os guardamos</h2>
      <p>Enquanto a sua conta existir. Quando apaga a conta, apagamos de imediato o seu perfil e as suas associações; as atualizações e ficheiros que adicionou a eventos partilhados ficam nesses eventos, sem ligação a si. As cópias de segurança cifradas são guardadas até 30 dias.</p>
      <p><strong>As mensagens nas conversas de uma organização</strong> (os seus canais, as conversas dos seus eventos e as conversas sobre equipamento, orçamentos e alugueres externos, incluindo o que clientes e fornecedores lá escrevem) são guardadas durante o tempo que os administradores dessa organização escolherem: para sempre, ou 90 dias, 6 meses, 1 ano ou 2 anos, findos os quais são apagadas, com os seus ficheiros, todas as noites. Esses administradores também podem descarregar as conversas da organização. As conversas diretas entre duas pessoas não são afetadas por nenhuma das duas coisas.</p>

      <h2>Os seus direitos</h2>
      <p>Os administradores de uma organização podem descarregar tudo o que a organização tem, como cópia de segurança ou para mudar de ferramenta: inclui os nomes, endereços de e-mail e papéis dos seus membros, os nomes da equipa dos seus eventos, os seus contactos e as suas mensagens. Pode aceder aos seus dados e descarregá-los (Conta → Exportar os meus dados), corrigir o seu nome e apagar a sua conta (Conta → Apagar conta) a qualquer momento. Pode também pedir a limitação do tratamento ou opor-se a ele. Se não estiver satisfeito com a forma como tratamos os seus dados, pode apresentar reclamação à <a href="https://www.cnpd.pt" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-text)' }}>CNPD</a> (Comissão Nacional de Proteção de Dados).</p>
    </>
  )
}

export function TermsPt() {
  return (
    <>
      <h1>Termos de utilização da beta</h1>
      <p className="meta">Última atualização: {LEGAL_LAST_UPDATED}</p>

      <h2>A beta</h2>
      <p>O {APP_NAME} está num piloto gratuito gerido pela {COMPANY_NAME}. As funcionalidades podem mudar e o serviço pode ser interrompido ou reiniciado. Guarde as suas próprias cópias dos documentos importantes.</p>

      <h2>A sua conta</h2>
      <p>Mantenha a palavra-passe privada e avise-nos <Contacto /> se achar que a sua conta foi usada por outra pessoa. É responsável pelas pessoas que convida para a sua organização e eventos.</p>

      <h2>O seu conteúdo</h2>
      <p>Você e a sua organização são donos de tudo o que carregam ou publicam. Autoriza-nos a guardar e mostrar esse conteúdo apenas para lhe prestarmos o {APP_NAME}. Carregue apenas conteúdo que tenha direito a partilhar.</p>

      <h2>Utilização aceitável</h2>
      <p>Não use o {APP_NAME} para infringir a lei, carregar software malicioso, aceder a dados que não foram partilhados consigo ou perturbar o serviço.</p>

      <h2>Sem garantias</h2>
      <p>A beta é fornecida "tal como está". Na medida permitida por lei, não somos responsáveis por perdas indiretas nem por dados perdidos durante a beta.</p>

      <h2>Cessação</h2>
      <p>Pode apagar a sua conta a qualquer momento. Podemos terminar o piloto ou suspender contas que violem estes termos, avisando sempre que possível.</p>

      <h2>Lei aplicável</h2>
      <p>Estes termos regem-se pela lei portuguesa.</p>
    </>
  )
}

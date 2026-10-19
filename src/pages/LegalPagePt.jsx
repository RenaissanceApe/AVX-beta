import { APP_NAME, COMPANY_NAME, CONTACT_EMAIL, LEGAL_LAST_UPDATED, SENTRY_DSN } from '../config'

// Versão portuguesa do aviso de privacidade e dos termos da beta.
// Manter alinhada com as versões em inglês em LegalPage.jsx.

function Contacto() {
  if (!CONTACT_EMAIL) return <>através da pessoa que o convidou para o {APP_NAME}</>
  return <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: '#1EC878' }}>{CONTACT_EMAIL}</a>
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
        <li><strong>Conta:</strong> o seu email, nome, número de telemóvel (opcional) e palavra-passe (guardada apenas como hash seguro pelo nosso fornecedor de autenticação).</li>
        <li><strong>Dados de trabalho que você ou a sua equipa adicionam:</strong> organizações, eventos, a sua função, horas de chamada e de marcação, datas que indica como indisponíveis, perguntas de disponibilidade que recebe e as suas respostas, ficheiros que carrega e atualizações que publica. Outras empresas só veem que está "marcado" num período, nunca onde.</li>
        <li><strong>Dados técnicos:</strong> horas de início de sessão e, nos registos de segurança dos nossos fornecedores, o endereço IP e o tipo de navegador.</li>
        <li><strong>Contagens de utilização:</strong> quantas vezes cada ecrã ou funcionalidade é usado por dia, somando todos os utilizadores. Estas contagens não têm nome, email, identificador de conta, endereço IP nem identificador do dispositivo, por isso não podem ser associadas a si.</li>
        <li><strong>Destinatários de orçamentos:</strong> se uma empresa lhe enviar um orçamento através do {APP_NAME}, guardamos os contactos que ela indicou e, se responder, o seu nome, a sua mensagem e a data da resposta.</li>
        <li><strong>Clientes e fornecedores que escrevem através de uma ligação:</strong> se escrever a uma empresa na página de um orçamento ou através de uma ligação de aluguer externo que ela lhe enviou, guardamos o nome que indicar e as suas mensagens. Só os administradores e membros dessa empresa as veem. São apagadas quando a empresa apagar o orçamento ou o aluguer externo, ou a sua organização.</li>
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
      <p><strong>Mensagens:</strong> as mensagens que envia são guardadas e mostradas às pessoas dessa conversa: a outra pessoa numa conversa direta, ou toda a gente que pode ver o evento no respetivo canal (incluindo quem for adicionado ao evento mais tarde). Só pode iniciar uma conversa com pessoas com quem partilha um evento ou organização. Não há confirmações de leitura: ninguém vê se ou quando leu uma mensagem. Os ficheiros que anexa são guardados de forma privada e só podem ser abertos pelas pessoas dessa conversa. Pode editar as suas mensagens (as pessoas da conversa podem ver as versões anteriores) ou apagá-las: apagar remove o texto, os ficheiros e as versões anteriores para todos. Os canais de uma organização são visíveis para a parte da organização que os administradores escolhem (todos, administradores e membros, ou só administradores); os canais de departamento de um evento são visíveis para quem tem essa função no evento e para a sua produção. Os avisos pedem-lhe que confirme que leu: quem enviou o aviso e quem gere esse canal veem quem confirmou e quando. As mensagens que guarda para depois só são visíveis para si. As perguntas de disponibilidade e as chamadas de equipa (ofertas de um lugar num evento) são publicadas na sua conversa direta com quem as enviou, juntamente com a sua resposta; aceitar uma chamada de equipa adiciona-o a esse evento. Quando o horário de um evento muda, é publicada uma nota curta no respetivo canal. Os administradores e membros de uma organização podem falar sobre um equipamento, uma reparação ou um aluguer externo numa conversa que só eles veem. A pesquisa só procura em conversas que já pode ler. As mensagens que enviou estão incluídas na exportação dos seus dados. O resumo por email pode citar o início de uma mensagem enviada para si, que o mencione ou de um aviso.</p>

      <h2>Durante quanto tempo os guardamos</h2>
      <p>Enquanto a sua conta existir. Quando apaga a conta, apagamos de imediato o seu perfil e as suas associações; as atualizações e ficheiros que adicionou a eventos partilhados ficam nesses eventos, sem ligação a si. As cópias de segurança cifradas são guardadas até 30 dias.</p>

      <h2>Os seus direitos</h2>
      <p>Pode aceder aos seus dados e descarregá-los (Conta → Exportar os meus dados), corrigir o seu nome e apagar a sua conta (Conta → Apagar conta) a qualquer momento. Pode também pedir a limitação do tratamento ou opor-se a ele. Se não estiver satisfeito com a forma como tratamos os seus dados, pode apresentar reclamação à <a href="https://www.cnpd.pt" target="_blank" rel="noopener noreferrer" style={{ color: '#1EC878' }}>CNPD</a> (Comissão Nacional de Proteção de Dados).</p>
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

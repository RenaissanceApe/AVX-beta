// Conteúdo de ajuda em português (docs/HELP.md, H1). Os mesmos ids do ficheiro inglês;
// help.test.js falha se faltar algum. Palavras simples, uma ideia por frase.

export default {
  terms: {
    gig: { term: 'Evento', definition: 'Um trabalho da sua equipa: um concerto, uma conferência, um aluguer.', example: 'Palco principal do festival, 12–14 de julho.', where: 'Lista de eventos, calendário, página do evento' },
    organisation: { term: 'Organização', definition: 'Uma empresa no AVX. Tem membros, eventos, equipamento e orçamentos.', example: 'Lumen and Pixel, com três administradores e vinte técnicos.', where: 'Seletor de empresa, no topo' },
    workspace: { term: 'Área de trabalho', definition: 'O que está a ver: uma organização, ou "O meu trabalho" com tudo aquilo em que está marcado.', example: 'Mudar de "Lumen and Pixel" para "O meu trabalho" para ver eventos de outras empresas.', where: 'Seletor de empresa, no topo' },
    'my-work': { term: 'O meu trabalho', definition: 'A sua vista pessoal: os eventos em que está, em todas as empresas, os seus pedidos e as datas indisponíveis.', example: 'Um freelancer vê eventos de três empresas numa só lista.', where: 'Seletor de empresa → O meu trabalho' },
    pm: { term: 'Diretor de Produção', definition: 'Gere um evento. Pode alterar tudo, convidar a equipa e enviar a folha de serviço.', example: 'A Ana é a diretora de produção do jantar de gala.', where: 'Evento → Equipa' },
    crew: { term: 'Equipa técnica', definition: 'Quem trabalha num evento. Vê o evento, os ficheiros e o horário, e pode escrever na conversa.', example: 'Técnicos de som e de luz.', where: 'Evento → Equipa' },
    viewer: { term: 'Leitor', definition: 'Quem pode ver um evento ou uma organização, mas não alterar nada.', example: 'Um cliente que acompanha o horário.', where: 'Evento → Equipa, membros da organização' },
    'org-admin': { term: 'Administrador', definition: 'Papel na organização que pode fazer tudo: membros, orçamentos, definições e eliminar.', example: 'O dono da empresa.', where: 'Organização → Membros' },
    'org-member': { term: 'Membro', definition: 'Papel na organização que trabalha em eventos, ficheiros e orçamentos, mas não em membros nem definições.', example: 'Um produtor do escritório.', where: 'Organização → Membros' },
    'call-time': { term: 'Hora de chamada', definition: 'A hora a que a pessoa tem de chegar ao evento.', example: 'Chamada às 08:00 no cais de carga.', where: 'Evento → Equipa, folha de serviço' },
    'timecode': { term: 'Timecode', definition: 'Um relógio em horas:minutos:segundos:frames partilhado por câmaras, mesas e controlo de espetáculo. As notas de ensaio são marcadas sobre ele para que todos falem do mesmo momento.', example: '01:02:15:12 é uma hora, dois minutos, quinze segundos e doze frames.', where: 'Evento → Ferramentas → Notas de ensaio' },
    'booking-times': { term: 'Horas marcadas (turno)', definition: 'As horas para que alguém está marcado. Sem elas, conta como ocupado nos dias inteiros do evento.', example: 'Marcado só das 14:00 às 20:00 no primeiro dia.', where: 'Evento → Equipa → Definir horas' },
    'double-booking': { term: 'Marcação sobreposta', definition: 'Uma pessoa ou equipamento marcado em duas coisas à mesma hora. O AVX avisa, mas não impede.', example: 'A Carla está em dois eventos no sábado à tarde.', where: 'Evento → Equipa, equipamento, calendário' },
    'availability-request': { term: 'Pergunta de disponibilidade', definition: 'Uma pergunta a alguém: está livre nestas datas? A pessoa responde sim ou não no telemóvel.', example: '"Pode fazer 13–14 de novembro?" → "Disponível, a partir das 10:00".', where: 'Evento → Equipa, O meu trabalho → Pedidos, mensagens' },
    'crew-call': { term: 'Chamada de equipa', definition: 'Uma oferta de lugar num evento a uma ou mais pessoas. Quem aceitar primeiro fica com o lugar.', example: 'Procuram-se dois técnicos de som; oferta enviada a cinco pessoas.', where: 'Evento → Equipa → Chamada de equipa' },
    'unavailable-dates': { term: 'Datas indisponíveis', definition: 'Dias que marca como não livres. Quem gere vê que está ocupado, não porquê.', example: 'Férias de 1 a 15 de agosto.', where: 'O meu trabalho' },
    'gig-status': { term: 'Estado do evento', definition: 'Em que ponto está o evento: rascunho, confirmado, em curso, concluído ou arquivado.', example: 'O orçamento foi aceite e o evento passa de rascunho a confirmado.', where: 'Página do evento, lista de eventos' },
    'call-sheet': { term: 'Folha de serviço', definition: 'Uma página com tudo o que a equipa precisa: horas, locais, contactos e horário.', example: 'Impressa e colada na porta do camião.', where: 'Evento → Folha de serviço' },
    schedule: { term: 'Horário', definition: 'O plano do evento com horas: montagem, testes de som, espetáculo, desmontagem.', example: '09:00 montagem, 14:00 line check, 21:00 abertura de portas.', where: 'Evento → Horário' },
    feed: { term: 'Atualizações', definition: 'Publicações oficiais de um evento, para o que todos têm de saber. As importantes notificam todos.', example: '"Mudança de local: agora no Coliseu."', where: 'Evento → Atualizações' },
    files: { term: 'Ficheiros e versões', definition: 'Documentos do evento. Carregar um ficheiro com o mesmo nome guarda uma nova versão e mantém as anteriores.', example: 'Planta de palco v1, v2, v3.', where: 'Evento → Ficheiros' },
    chat: { term: 'Conversa (canal)', definition: 'Uma conversa de grupo: de um evento, de um departamento do evento ou da organização.', example: 'A conversa do evento, ou "Som" só para a equipa de som.', where: 'Mensagens, Evento → Conversa' },
    'direct-message': { term: 'Mensagem direta', definition: 'Uma conversa privada entre duas pessoas que partilham um evento ou uma organização.', example: 'Perguntar ao diretor de produção onde estacionar.', where: 'Mensagens' },
    announcement: { term: 'Aviso', definition: 'Uma mensagem que pede a todos que confirmem que leram. Quem a envia vê quem confirmou.', example: '"Novas regras de segurança — confirmem, por favor."', where: 'Mensagens' },
    mute: { term: 'Silenciar', definition: 'Deixar de receber notificações de uma conversa ou organização. O que lhe é dirigido continua a chegar.', example: 'Silenciar um canal movimentado durante as férias.', where: 'Mensagens, seletor de empresa' },
    'email-summary': { term: 'Resumo por email', definition: 'Um email por dia com as notificações que ainda não leu. Não é enviado nada se estiver em dia.', example: 'Todas as manhãs: "3 atualizações por ver".', where: 'Definições → Notificações' },
    'push-notifications': { term: 'Notificações neste dispositivo', definition: 'Alertas no telemóvel ou no computador, como em qualquer aplicação. Cada dispositivo é ativado à parte.', example: 'O telemóvel vibra quando alguém o menciona.', where: 'Definições → Notificações' },
    'two-step': { term: 'Início de sessão em dois passos', definition: 'Para entrar, além da palavra-passe, é pedido um código de 6 dígitos de uma aplicação no telemóvel.', example: 'O Google Authenticator mostra 482 913.', where: 'Definições → Início de sessão e segurança' },
    'offline-copy': { term: 'Cópia sem rede', definition: 'A última versão dos seus eventos guardada no dispositivo, que pode ler sem rede.', example: 'Ler a folha de serviço numa cave sem rede.', where: 'Eventos, página do evento, folha de serviço' },
    network: { term: 'A sua rede', definition: 'As pessoas com quem já trabalhou num evento ou numa organização; podem ser encontradas pelo nome. Os freelancers que ligam o perfil profissional também podem ser encontrados pelas empresas em Procurar técnicos.', example: 'Convidar um técnico com quem trabalhou no ano passado.', where: 'Evento → Equipa → Convidar' },
    findable: { term: 'Quem o pode encontrar', definition: 'Quem o pode encontrar pelo nome ao formar uma equipa: só quem gere e administra, ou também outros técnicos.', example: 'Um diretor de produção freelancer encontra-o se permitir "outros técnicos".', where: 'Definições → Privacidade e bloqueios' },
    'catalogue-item': { term: 'Artigo do catálogo', definition: 'Um tipo de equipamento que tem ou aluga, com preço e stock.', example: 'Microfone Shure SM58.', where: 'Inventário → Catálogo' },
    'bulk-item': { term: 'Contado a granel', definition: 'Stock guardado como um número por local, e não um a um.', example: '120 cabos XLR no armazém.', where: 'Inventário → artigo' },
    'serial-item': { term: 'Por número de série', definition: 'Cada unidade é registada à parte, com número de série, etiqueta QR e estado.', example: 'Cada uma das 8 cabeças móveis tem o seu registo.', where: 'Inventário → artigo → Unidades' },
    unit: { term: 'Unidade', definition: 'Uma peça física de equipamento com número de série.', example: 'Cabeça móvel MH-03, série A12345.', where: 'Inventário → artigo → Unidades' },
    location: { term: 'Local', definition: 'Onde o stock está guardado: um armazém, uma prateleira, uma carrinha.', example: 'Armazém principal, prateleira B4.', where: 'Inventário → Locais' },
    'stock-movement': { term: 'Movimento de stock', definition: 'Uma alteração registada no stock: compra, mudança de local, perda, venda, achado.', example: '+20 cabos comprados.', where: 'Inventário → Movimentos' },
    set: { term: 'Conjunto', definition: 'Artigos que vão sempre juntos e têm um só preço.', example: 'Set de DJ: dois leitores e uma mesa.', where: 'Inventário → artigo → Kit' },
    case: { term: 'Case', definition: 'Uma flight case com unidades lá dentro. Ler a case regista tudo o que contém.', example: 'Case com 6 microfones sem fios.', where: 'Inventário → artigo → Kit' },
    accessory: { term: 'Acessório', definition: 'Algo que vai junto com um artigo quando o adiciona a um evento.', example: 'Um grampo com cada projetor.', where: 'Inventário → artigo → Kit' },
    alternative: { term: 'Alternativa', definition: 'Um artigo que pode substituir outro quando este não está disponível.', example: 'SM57 em vez de SM58.', where: 'Inventário → artigo, equipamento do evento' },
    'prep-return-days': { term: 'Dias de preparação e de devolução', definition: 'Dias antes e depois de um evento em que o equipamento continua reservado, para carregar, testar e conferir.', example: '1 dia de preparação: o material fica ocupado desde a véspera.', where: 'Definições da organização, equipamento do evento' },
    'packing-list': { term: 'Lista de carga', definition: 'O que tem de sair do armazém para um evento, com quantidades.', example: 'Impressa para o armazém na véspera.', where: 'Evento → Equipamento → Lista de carga' },
    'scan-out-in': { term: 'Registar saída / entrada', definition: 'Ler as etiquetas QR quando o equipamento sai para um evento e quando volta.', example: 'Registar 40 unidades à entrada do camião.', where: 'Evento → Equipamento → Ler' },
    'equipment-steps': { term: 'Etapas do equipamento', definition: 'Onde está o equipamento de um evento entre o armazém e o regresso: preparado, saída, no local, carregado no regresso, entrada, verificado.', example: '60 de 69 preparados, 40 saíram.', where: 'Evento → Equipamento, Saída / entrada, lista de carga' },
    'dmx-universe': { term: 'Universo DMX', definition: 'Uma linha de 512 canais de controlo de luz. Um projetor usa alguns deles, a partir do endereço inicial.', example: 'Universo 1 para as cabeças móveis, universo 2 para as barras LED.', where: 'Evento → Ferramentas → Patch DMX' },
    'dmx-address': { term: 'Endereço DMX', definition: 'O primeiro canal que um projetor ouve no seu universo. Usa esse e os seguintes, tantos quantos os seus canais.', example: 'Um spot de 14 canais no endereço 15 usa os canais 15 a 28.', where: 'Evento → Ferramentas → Patch DMX' },
    split: { term: 'Split', definition: 'Enviar as mesmas entradas de palco para duas mesas, normalmente a de sala e a de monitores.', example: 'A SB1 tem split para a mesa de monitores.', where: 'Evento → Ferramentas → Patch' },
    haas: { term: 'Efeito Haas', definition: 'Ouvimos o som como vindo de onde nos chega primeiro. Atrasar uma torre de delay uns milissegundos para lá da principal faz o som continuar a parecer vir do palco.', example: 'Torre de delay acertada 10 ms depois do som das principais.', where: 'Evento → Ferramentas → Calculadora de sistema de som' },
    spl: { term: 'SPL', definition: 'Nível de pressão sonora: o volume, em decibéis. Desce cerca de 6 dB cada vez que a distância duplica.', example: '136 dB a 1 m são cerca de 106 dB a 32 m.', where: 'Evento → Ferramentas → Calculadora de sistema de som' },
    truss: { term: 'Truss', definition: 'Uma estrutura metálica onde se pendura a luz, suspensa sobre o palco ou assente no chão.', example: 'Truss 1 a 7 m com oito spots.', where: 'Evento → Ferramentas → Plano de luz' },
    'power-phase': { term: 'Fase elétrica', definition: 'Um dos condutores com tensão de uma alimentação. Uma alimentação trifásica tem três, cada uma com o seu limite em amperes; a carga deve ser repartida por elas.', example: 'Uma alimentação trifásica de 32 A dá 32 A em cada uma de L1, L2 e L3.', where: 'Evento → Ferramentas → Plano de luz' },
    'stage-plot': { term: 'Stage plot', definition: 'Um desenho do palco visto de cima com o lugar de cada coisa: bateria, microfones, amplificadores, monitores, estrados.', example: 'O plot da banda com o estrado da bateria ao fundo, ao centro.', where: 'Evento → Ferramentas' },
    'input-list': { term: 'Lista de inputs', definition: 'A lista de tudo o que entra na mesa de som, uma linha por canal: fonte, microfone ou DI, tripé, 48V.', example: 'Can 1 Bombo dentro, Beta 91A, 48V.', where: 'Evento → Ferramentas' },
    'phantom-power': { term: '48V (alimentação phantom)', definition: 'Corrente que a mesa envia pelo cabo do microfone para microfones de condensador e DIs ativas.', example: 'Os overheads e as DIs precisam de 48V; um SM58 dinâmico não.', where: 'Evento → Ferramentas → Lista de inputs' },
    'stage-box': { term: 'Stage box', definition: 'Uma caixa em palco com muitas entradas que as envia para a mesa por um só cabo.', example: 'SB1-03: stage box 1, entrada 3.', where: 'Evento → Ferramentas → Lista de inputs' },
    'line-check': { term: 'Line check', definition: 'Testar cada canal antes do soundcheck: algo ligado, sinal na mesa. Marque cada linha à medida que avança.', example: 'As 24 linhas verificadas até às 15:00.', where: 'Evento → Ferramentas → Lista de inputs' },
    'field-tools': { term: 'Ferramentas técnicas', definition: 'Ferramentas técnicas opcionais de um evento (lista de inputs e, em breve, stage plot, patch, plano de luz), no separador Ferramentas.', example: 'A lista de inputs da gala.', where: 'Evento → Ferramentas; definições da organização' },
    'scan-mode': { term: 'Modo de leitura', definition: 'Uma forma de ler etiquetas em ecrã inteiro, com botões grandes, sons, vibração e lanterna, para luvas, barulho e escuro.', example: 'Carregar a carrinha à noite só com uma mão livre.', where: 'Evento → Equipamento → Saída / entrada' },
    'mark-lost': { term: 'Marcar como perdido', definition: 'As unidades que não voltaram são registadas como perdidas, para que o stock e os relatórios estejam certos.', example: 'Dois cabos em falta depois do festival.', where: 'Evento → Ler' },
    damage: { term: 'Relatório de dano', definition: 'Uma nota, com fotografias, de que algo se partiu. A unidade pode ficar fora de uso.', example: 'Lente rachada, reportada no local.', where: 'Evento → Equipamento, Inventário → Manutenção' },
    repair: { term: 'Reparação', definition: 'Arranjar uma unidade danificada. Enquanto está em reparação não fica disponível para eventos.', example: 'Enviada ao fabricante durante 2 semanas.', where: 'Inventário → Manutenção' },
    'write-off': { term: 'Abate', definition: 'Retirar equipamento do stock de vez porque não tem reparação.', example: 'Um projetor sem arranjo.', where: 'Inventário → Manutenção' },
    inspection: { term: 'Inspeção periódica', definition: 'Uma verificação de segurança feita de tantos em tantos meses, como o teste elétrico (PAT).', example: 'PAT a cada 12 meses para todos os cabos.', where: 'Inventário → artigo, Manutenção' },
    'replacement-value': { term: 'Valor de substituição', definition: 'Quanto custaria comprar o artigo de novo hoje.', example: '1200 € por uma cabeça móvel.', where: 'Inventário → artigo' },
    depreciation: { term: 'Valor contabilístico e amortização', definition: 'Quanto vale o equipamento no papel: o preço menos o desgaste ao longo dos meses que escolher.', example: '6000 € em 60 meses valem 3000 € ao fim de 30 meses.', where: 'Inventário → Relatórios' },
    subrental: { term: 'Aluguer externo', definition: 'Equipamento que aluga a outra empresa para um evento.', example: 'Alugar mais 4 colunas para o festival.', where: 'Inventário → Alugueres externos' },
    supplier: { term: 'Fornecedor', definition: 'A empresa a quem aluga o equipamento.', example: 'Uma empresa de aluguer no Porto.', where: 'Contactos → Fornecedores' },
    client: { term: 'Cliente', definition: 'Uma empresa ou pessoa para quem faz orçamentos, guardada uma vez nos Contactos e escolhida em cada orçamento.', example: 'Festival Lda, contacto Ana, com NIF e morada.', where: 'Contactos → Clientes' },
    'cross-hire-code': { term: 'Código de cross-hire', definition: 'Um código que liga duas empresas no AVX, para que os pedidos de aluguer cheguem diretamente à outra empresa.', example: 'P-7K2Q.', where: 'Inventário → Alugueres externos' },
    quote: { term: 'Orçamento', definition: 'Uma proposta com preços para um cliente, feita a partir da sua tabela de preços.', example: 'Orçamento 2026-014 para o jantar de gala.', where: 'Orçamentos' },
    'quote-version': { term: 'Versão do orçamento', definition: 'Uma cópia guardada do orçamento tal como foi enviado. Alterações depois disso criam uma nova versão.', example: 'v1 enviada, o cliente pediu menos, v2 enviada.', where: 'Orçamento → Versões' },
    phase: { term: 'Fase', definition: 'Uma parte do orçamento com os seus dias e desconto, como ensaio e espetáculo.', example: 'Ensaio (1 dia) e Espetáculo (2 dias).', where: 'Editor de orçamentos' },
    factor: { term: 'Fator', definition: 'Quantos preços diários custa uma linha na fase inteira. Muitas vezes menos do que o número de dias.', example: '3 dias com fator 2,5.', where: 'Editor de orçamentos' },
    vat: { term: 'IVA', definition: 'Imposto somado ao preço. A taxa é definida em cada orçamento.', example: '23% no continente.', where: 'Orçamento → Detalhes' },
    validity: { term: 'Validade', definition: 'Quantos dias o cliente tem para aceitar um orçamento.', example: 'Válido por 30 dias.', where: 'Orçamentos → Dados da empresa' },
    'client-link': { term: 'Ligação para o cliente', definition: 'Um endereço privado onde o cliente lê o orçamento, o aceita e lhe escreve, sem conta.', example: 'Enviado por email com o PDF.', where: 'Orçamento → Enviar' },
    'price-list': { term: 'Tabela de preços', definition: 'Os seus preços de equipamento e serviços, usados para fazer orçamentos.', example: 'SM58: 8 € por dia.', where: 'Orçamentos → Tabela de preços' },
    retention: { term: 'Guardar mensagens', definition: 'Durante quanto tempo uma organização guarda as mensagens das suas conversas antes de serem apagadas.', example: 'Guardar durante 1 ano.', where: 'Definições da organização → Mensagens' },
    report: { term: 'Denunciar uma mensagem', definition: 'Avisar quem gere uma conversa de que uma mensagem é spam ou abusiva. Não veem quem a denunciou.', example: 'Denunciar um anúncio publicado na conversa de um evento.', where: 'Mensagens → menu da mensagem' },
    block: { term: 'Bloquear', definition: 'Impedir alguém de lhe escrever numa conversa direta.', example: 'Bloquear uma pessoa que não para de enviar mensagens.', where: 'Mensagens, Definições → Privacidade e bloqueios' },
  },

  hints: {
    'prep-days': 'Dias antes do evento em que o equipamento já fica reservado, para carregar e testar. Exemplo: 1 = o material fica ocupado desde a véspera.',
    'return-days': 'Dias depois do evento em que o equipamento continua reservado, para descarregar e conferir. Exemplo: 1 = ocupado até ao dia seguinte.',
    tracking: 'Contado a granel: guarda um número por local (cabos). Por número de série: cada unidade tem o seu registo e etiqueta QR (cabeças móveis). Não pode mudar depois de haver stock.',
    'kit-type': 'Conjunto: artigos que vão sempre juntos, com um só preço (um set de DJ). Case: uma flight case com unidades; ler a case regista tudo o que tem dentro.',
    'min-stock': 'Quando o stock fica abaixo deste número, o artigo aparece como em falta. Exemplo: 10 para pilhas de reserva.',
    'replacement-value': 'Quanto custaria comprar de novo hoje. Serve para o seguro e para cobrar material perdido ou partido.',
    depreciation: 'Em quantos meses o preço de compra desce até zero no papel. Exemplo: 60 = cinco anos.',
    'inspection-interval': 'De quanto em quanto tempo este equipamento precisa de uma verificação de segurança, como o teste elétrico (PAT). Recebe um lembrete quando estiver a vencer.',
    'unit-status': 'Disponível: pode ir para eventos. Em reparação: indisponível até estar arranjada. Perdida e Abatida retiram a unidade do stock.',
    'cross-hire-code': 'Se o seu fornecedor também usa o AVX, peça-lhe o código. Os pedidos passam a chegar-lhe diretamente e ele confirma no AVX.',
    factor: 'Quantos preços diários custa esta linha na fase inteira. Exemplo: 3 dias com fator 2,5 custam 2,5 × o preço diário.',
    discount: 'Uma percentagem retirada ao total desta fase, antes do IVA.',
    vat: 'A taxa de IVA somada ao total do orçamento. Exemplo: 23 no continente.',
    validity: 'Durante quantos dias um orçamento novo é válido. Depois disso o cliente ainda o pode ler, mas já não o pode aceitar.',
    'call-time': 'A hora a que esta pessoa tem de chegar. Aparece na folha de serviço e no telemóvel dela.',
    'booking-times': 'As horas para que esta pessoa está marcada. Sem elas, conta como ocupada nos dias inteiros do evento, e trabalhos curtos no mesmo dia pareceriam sobrepostos.',
    'gig-status': 'Rascunho: ainda em planeamento. Confirmado: vai acontecer. Em curso: está a decorrer. Concluído: terminou. Arquivado: guardado, mas fora das listas.',
    'gig-role': 'Diretor de Produção: altera tudo no evento. Equipa técnica: vê o evento, os ficheiros e o horário, e escreve na conversa. Leitor: só vê.',
    'org-role': 'Administrador: tudo, incluindo membros e definições. Membro: eventos, ficheiros e orçamentos. Leitor: vê os eventos, sem orçamentos nem preços.',
    findable: 'Quem o pode encontrar pelo nome ao formar uma equipa. Só pessoas com quem já trabalhou, nunca toda a gente no AVX.',
    'email-summary': 'Um email por dia com o que ainda não leu na aplicação. Não é enviado nada se estiver em dia.',
    'two-step': 'Para entrar, será também pedido um código de 6 dígitos de uma aplicação no telemóvel. Recomendado para administradores.',
    'dmx-footprint': 'Quantos canais DMX um projetor usa no seu modo, segundo o manual (ex.: 14 para um MAC Aura em Extended).',
    'dmx-universe': 'Uma linha DMX de 512 canais. Rigs grandes usam vários; cada projetor está num.',
    'sys-temp': 'O som viaja mais depressa no ar quente. Use a temperatura prevista durante o espetáculo.',
    'sys-haas': 'Quanto mais tarde que a principal deve chegar um delay ou fill, para o som continuar a parecer vir do palco. O habitual é 5–15 ms.',
    'sys-y': 'Metros a partir da frente do palco: negativos para o público (p. ex. −25 para uma posição a 25 m), positivos para o fundo.',
    'sys-spl': 'O máximo que uma caixa dá a 1 m, da ficha técnica (SPL máximo).',
    'sys-angle': 'Quão largo a caixa espalha o som da esquerda para a direita, da ficha técnica (p. ex. 90° ou 110°).',
    'light-trim': 'A que altura fica a vara, do chão do palco até à vara, em metros.',
    'light-phase': 'Que fase da alimentação alimenta esta posição. Deixe repartida e a carga é dividida por igual pelas fases.',
    'light-power': 'A potência do projetor, do manual ou da etiqueta. Vem do artigo do catálogo quando existe.',
    'light-supply': 'O limite da alimentação em cada fase, p. ex. 32 para uma tomada de 32 A. O plano avisa acima de 80%.',
    'input-item': 'Ligue o microfone ou DI a um artigo do catálogo. "Juntar microfones e DIs ao equipamento" passa a prevê-los no evento, para serem reservados, carregados e lidos.',
    'stage-box': 'Em que entrada da stage box entra a linha, ex.: SB1-03 (caixa 1, entrada 3). Ajuda a equipa de palco a ligar.',
    'mark-lost': 'Regista como perdidas as unidades que não voltaram. O stock e os relatórios mudam. Se alguma aparecer mais tarde, volte a pôr o estado em Disponível.',
    'quote-client': 'Escolher um cliente preenche os dados dele a partir dos Contactos. O orçamento guarda a sua própria cópia, por isso ainda pode alterá-los aqui só para este orçamento.',
  },

  pages: {
    'pocket-tools': { title: 'Ferramentas de bolso', summary: 'Calculadoras para qualquer sala, com ou sem evento no AVX: endereços DMX e dipswitches, um bloco de projetores, universos e canais absolutos, e conversão de valores. Funcionam sem ligação.' },
    home: { title: 'Eventos', summary: 'Os eventos da empresa escolhida no topo, ou todos os seus em "O meu trabalho". Abra um para ver a equipa, o horário, os ficheiros e a conversa. O calendário mostra os mesmos eventos por data.' },
    gig: { title: 'Um evento', summary: 'Tudo sobre um evento, em separadores: resumo, equipa, horário, equipamento, ficheiros, atualizações e conversa. Quem gere altera; a equipa vê e pode escrever na conversa.' },
    messages: { title: 'Mensagens', summary: 'As suas conversas: mensagens diretas, conversas de eventos, canais de departamento e da organização. As que têm mensagens por ler aparecem primeiro. Use o menu de uma mensagem para responder, reagir, guardar ou denunciar.' },
    inventory: { title: 'Inventário', summary: 'O seu equipamento: o catálogo, onde está guardado, o stock e os movimentos, a manutenção e os alugueres externos.' },
    'inventory-item': { title: 'Um artigo de equipamento', summary: 'Um artigo do catálogo: detalhes, stock por local, unidades com etiquetas, conteúdo do kit, manutenção e histórico.' },
    jobs: { title: 'Trabalhos', summary: 'Vagas abertas de empresas no AVX: as das suas funções e distância, ou todas, e as suas candidaturas. O seu preço por dia só vai para a empresa a que se candidata.' },
    'org-jobs': { title: 'Vagas publicadas', summary: 'As vagas que a vossa organização publicou e quem se candidatou. Ponha na lista final, recuse ou ofereça o lugar; feche uma vaga ou marque-a como preenchida.' },
    'org-tasks': { title: 'Tarefas', summary: 'As tarefas da própria organização e as dos seus eventos, com os modelos de lista.' },
    'crew-search': { title: 'Procurar técnicos', summary: 'Freelancers no AVX que ligaram o seu perfil profissional e deixam que as empresas o vejam. Pesquise por função, local, datas e língua, e depois pergunte por um evento ou ofereça um lugar. Os contactos ficam privados até a pessoa entrar.' },
    'crew-profile': { title: 'Perfil profissional', summary: 'Deixe que as empresas no AVX o encontrem para trabalhar. Desligado até o ligar; escolhe quem o vê (só empresas, ou empresas e técnicos) e pode mudá-lo, desligá-lo ou removê-lo a qualquer momento. Sem preços.' },
    contacts: { title: 'Contactos', summary: 'Os seus clientes e fornecedores, guardados uma vez. Os orçamentos escolhem daqui o cliente e os sub-alugueres o fornecedor. Importe-os de uma folha de cálculo, ou adicione de uma vez os clientes escritos em orçamentos antigos.' },
    quotes: { title: 'Orçamentos', summary: 'Os orçamentos da sua empresa, os mais recentes primeiro. Abra um para o editar, enviar ao cliente ou transformar um orçamento aceite num evento.' },
    quote: { title: 'Um orçamento', summary: 'Construa o orçamento em fases, com linhas da sua tabela de preços. Cada envio guarda uma versão. O cliente lê e aceita através de uma ligação privada.' },
    orgs: { title: 'Organizações', summary: 'As empresas a que pertence e o seu papel em cada uma. Os administradores abrem daqui os membros e as definições.' },
  },

  // guides: Ajuda → Guias e o painel ?. Os passos correspondem às imagens em index.js (GUIDES).
  guides: {
    'crew-join': {
      title: 'Aceitar um convite e definir a palavra-passe',
      intro: 'Um diretor de produção adicionou-o a um evento. Configure a conta uma vez e passa a ver todos os seus eventos num só sítio.',
      steps: [
        'Abra o email do AVX e toque no botão. Use o telemóvel ou o computador com que vai trabalhar.',
        'Escreva o seu nome completo e escolha uma palavra-passe com pelo menos 8 caracteres. Toque em Continuar.',
        'Já está. "O meu trabalho" mostra o seu próximo evento com a hora de chamada; "Todos os meus eventos" lista todos os eventos em que está, em qualquer empresa.',
        'Da próxima vez, entre com o mesmo email e a mesma palavra-passe. Se se esquecer dela, "Esqueceu-se da palavra-passe?" na página de entrada envia-lhe um link.',
      ],
      mistakes: [
        'O link expirou: vá à página de entrada, toque em "Esqueceu-se da palavra-passe?" e use o email para onde foi enviado o convite.',
        'Criou a conta com outro email: o evento não aparece. Peça ao diretor de produção que convide esse email.',
      ],
    },
    'crew-install': {
      title: 'Instalar o AVX no telemóvel',
      intro: 'O AVX funciona no navegador, mas no ecrã principal abre como uma app, em ecrã inteiro, e pode enviar-lhe notificações.',
      steps: [
        'iPhone: abra o AVX no Safari. Toque em Partilhar (o quadrado com uma seta) e depois em "Adicionar ao ecrã principal".',
        'Android: abra o AVX no Chrome. Toque no menu (três pontos) e depois em "Instalar app" ou "Adicionar ao ecrã principal".',
        'Abra o AVX a partir do novo ícone no ecrã principal e entre na conta, se lhe for pedido.',
        'Para receber notificações: toque nas suas iniciais, no canto superior direito, para abrir as Definições, escolha Notificações e ligue "Notificações neste dispositivo".',
      ],
      mistakes: [
        'No iPhone, as notificações só funcionam com o AVX aberto a partir do ícone do ecrã principal, não no Safari.',
        'Tocou em "Não permitir": autorize as notificações do AVX nas definições do telemóvel e volte a ligá-las no AVX.',
      ],
    },
    'crew-call-time': {
      title: 'Ver a hora de chamada e a folha de serviço',
      intro: 'A hora de chamada é a hora a que tem de chegar. A folha de serviço tem o plano do dia e o telefone de toda a gente.',
      steps: [
        'Em "O meu trabalho", o seu próximo evento está no topo, com a hora de chamada a verde. "Folha de serviço" abre-a logo; "Abrir o evento" mostra o resto.',
        'No evento, a sua hora de chamada está por baixo do nome do evento, a verde.',
        'Toque em Horário para ver o alinhamento. Toque em "Folha de serviço" para a folha completa.',
        'A folha de serviço mostra o horário e a equipa com os telefones. Pode imprimi-la ou guardá-la em PDF.',
        'Toque em "Letra grande" para letras maiores (imprime assim também), ou em "Ler em voz alta" para a ouvir com a voz do telemóvel. A sua linha está marcada a amarelo.',
      ],
      mistakes: [
        'A hora de chamada é a hora a que começa a trabalhar, não a hora do espetáculo.',
        'As horas podem mudar. Volte a ver na véspera; as alterações ao horário também aparecem na conversa do evento.',
      ],
    },
    'crew-calendar': {
      title: 'Veja os seus eventos no calendário do telemóvel',
      intro: 'Os seus eventos podem aparecer no calendário que já usa (Apple, Google ou Outlook), junto com tudo o resto, sem abrir o AVX.',
      steps: [
        'Abra as Definições (as suas iniciais no topo) e escolha "Calendário no telemóvel".',
        'Toque em "Obter a ligação do calendário" e depois em "Adicionar à Apple / Outlook" num iPhone ou Mac, ou "Adicionar ao Google Calendar" no Android. O calendário pergunta se quer subscrever: diga que sim.',
        'A partir daí os eventos em que está aparecem com o local, o seu papel e a hora de chamada, e atualizam-se sozinhos (a maioria dos calendários verifica mais ou menos de hora a hora).',
      ],
      mistakes: [
        'A ligação é privada: quem a tiver vê os nomes, datas e locais dos seus eventos. Se a partilhou por engano, toque em "Nova ligação"; a antiga deixa de funcionar.',
        'As alterações feitas no AVX podem demorar uma hora ou mais a aparecer no calendário. Para a hora de chamada mais recente, abra o evento no AVX.',
      ],
    },
    'crew-jobs': {
      title: 'Encontrar trabalho nas vagas',
      intro: 'As empresas no AVX publicam vagas abertas. As que encaixam no que faz e na distância a que se desloca aparecem para si.',
      steps: [
        'Ligue primeiro o seu perfil profissional (funções, localidade, distância). Depois abra Trabalhos no menu.',
        '"Para si" mostra as vagas que encaixam; "Todas as vagas" mostra todas. Cada uma diz as datas, a localidade, o pagamento ou "Envie o seu preço por dia".',
        'Toque em Candidatar-me, escreva uma mensagem curta, indique o seu preço por dia se for pedido e confirme que está livre. A empresa responde nas suas mensagens; se lhe oferecer o lugar e aceitar, entra no evento.',
      ],
      mistakes: [
        'O seu preço por dia só vai para essa empresa, nunca para o perfil. "As minhas candidaturas" mostra o ponto de cada uma; pode retirar enquanto estiver aberta.',
        'Se nada aparece "Para si", alargue a distância ou acrescente funções no seu perfil profissional.',
        'As vagas novas que lhe servem também chegam como notificação (no máximo 10 por dia). Não as quer? Desmarque "Avisar-me de novos trabalhos que me servem" no seu perfil profissional.',
      ],
    },
    'crew-rehearsal': {
      title: 'Tirar notas durante um ensaio',
      intro: 'Toda a gente no evento escreve notas ao mesmo tempo, sobre o mesmo timecode. No fim, cada departamento tem a sua lista.',
      steps: [
        'Abra o evento → Ferramentas → Notas de ensaio. Quem começa a passagem toca em "Nova sessão", dá-lhe um nome e escolhe a frame rate e o relógio (hora do dia ou cronómetro).',
        'Toda a gente vê o mesmo timecode. Quando algo acontece, toque em Marcar: a hora fica registada nesse instante. Escolha o departamento e a prioridade, junte a cue ou a música, escreva ou dite a nota, junte uma foto se ajudar, e guarde.',
        'As notas aparecem para todos à medida que são escritas. Mostre só um departamento, as suas ("Minhas") ou as que estão em aberto, e marque uma nota quando estiver feita.',
        'Depois da passagem, Relatório imprime as notas por departamento e CSV abre numa folha de cálculo. As notas em aberto voltam a aparecer na sessão seguinte.',
      ],
      mistakes: [
        'O relógio é partilhado: se alguém o acertar pelo timecode do espetáculo, o de toda a gente acompanha. Acerte-o pelo timecode que o espetáculo realmente usa: "Pela câmara" lê um ecrã de timecode com a câmara do telemóvel, "Por LTC" ouve o sinal LTC, ou escreva-o em "Acertar o relógio".',
        'Sem ligação? As notas ficam no telemóvel e são enviadas quando voltar a ter rede; as fotos precisam de ligação.',
      ],
    },
    'pm-tasks': {
      title: 'Distribuir tarefas num evento',
      intro: 'Quem faz o quê e até quando: uma tarefa por trabalho, com uma lista quando tem passos.',
      steps: [
        'Abra o evento → Tarefas → "Nova tarefa". Escreva o quê, escolha para quem e o prazo, e junte uma lista com um item por linha. A pessoa recebe uma notificação.',
        'Toque numa tarefa para ver as notas e a lista. Qualquer pessoa no evento pode marcar a lista e a tarefa; as atrasadas ficam a vermelho. "Minhas" e "Em aberto" filtram a lista.',
        'A partir de uma nota de ensaio, o ícone de lista transforma-a numa tarefa para a mesma pessoa. Cada um vê as suas tarefas, de todos os eventos, em O meu trabalho → As minhas tarefas.',
      ],
      mistakes: [
        'Só quem gere o evento e os administradores e membros da organização criam e alteram tarefas; a equipa marca-as.',
        'As tarefas só podem ser dadas a pessoas no evento. Junte-as primeiro à equipa.',
      ],
    },
    'pm-org-tasks': {
      title: 'Tarefas da organização e modelos de lista',
      intro: 'Trabalhos de escritório e armazém, reparações e listas que usa em todos os eventos.',
      steps: [
        'Abra Organização → Tarefas. Mostra as tarefas da própria organização e as dos eventos que pode ver. "Nova tarefa" cria uma para alguém da organização; "Organização" e "Nos eventos" filtram a lista.',
        'Em "Modelos de lista", escreva uma lista uma vez (verificação da carrinha, desmontagem). Ao começar uma tarefa, num evento ou aqui, "Começar a partir de um modelo" preenche a lista.',
        'Em Inventário → Manutenção, abra uma reparação e toque em "Criar tarefa": a reparação passa a ser uma tarefa da organização, pronta a atribuir.',
      ],
      mistakes: [
        'Alterar um modelo não muda as tarefas já criadas a partir dele.',
        'As tarefas de um evento editam-se no evento; aqui pode marcá-las.',
      ],
    },
    'crew-onsite': {
      title: 'Usar o modo no local no dia',
      intro: 'Nos dias de um evento, o evento abre com o que precisa ali e naquele momento, em botões grandes.',
      steps: [
        'Num dia de evento, abra o evento: começa sozinho no modo no local. Noutro dia, toque em "Modo no local" no evento para o ligar.',
        'No topo: a sua hora de chamada e o horário de hoje, com o que está a acontecer agora e a seguir. Por baixo, botões grandes para a folha de serviço, as notas de ensaio, percorrer o rig, a lista de inputs, ler equipamento, ficheiros, conversa e os telefones da equipa.',
        '"Vista completa do evento" volta ao resumo habitual até ao fim do dia. Os separadores estão sempre lá.',
      ],
      mistakes: [
        'Não quer que ligue sozinho? Desmarque "Passar para o modo no local nos dias de evento" em Definições → Língua e aparência. Fica guardado em cada dispositivo.',
        'Abra o evento uma vez antes de chegar ao local, para ficar guardado no telemóvel para quando não houver rede.',
      ],
    },
    'crew-dmx-calc': {
      title: 'Definir o endereço DMX de um projetor pelos dipswitches',
      intro: 'Muitos projetores recebem o endereço de uma fila de pequenos interruptores. O AVX mostra quais deve mudar.',
      steps: [
        'Abra O meu trabalho → Ferramentas de bolso (sem evento), ou o patch DMX de um evento. Em "Como os meus projetores mostram os interruptores", escolha o que a etiqueta do projetor indica: para que lado é ON e de que lado está o interruptor 1.',
        'Escreva o endereço: os interruptores a pôr em ON acendem, desenhados como no projetor. Tocar nos interruptores faz o contrário. Mais abaixo, "Endereçar uma fila de projetores" lista cada endereço e os seus interruptores para um bloco do mesmo projetor.',
        'No local, no patch DMX do evento toque em "Percorrer o rig": um projetor de cada vez, agrupados por posição, com interruptores grandes e "Projetor seguinte". Funciona sem ligação.',
      ],
      mistakes: [
        'Os dipswitches só chegam ao endereço 511. Acima disso, use o menu do projetor.',
        'Alguns projetores têm um 10.º interruptor de função (que não faz parte do endereço): escolha 10 interruptores e deixe-o como está.',
      ],
    },
    'crew-trust': {
      title: 'Mostre que os seus certificados são reais e escolha quem o contacta',
      intro: 'As empresas confiam mais num certificado que alguém verificou. E é o próprio que decide que empresas o podem contactar.',
      steps: [
        'No seu perfil profissional, guarde os certificados. Por baixo de cada um, "Carregar comprovativo" envia uma foto ou PDF à AVX; depois de verificado, as empresas veem "comprovativo verificado pela AVX". Só a AVX vê o ficheiro.',
        'Uma empresa que já o teve num dos seus eventos também pode confirmar um certificado: passa a mostrar "confirmado por" essa empresa.',
        'Em "Quem o pode contactar sobre trabalho", escolha "Só empresas com quem já trabalhei" se não quer que empresas novas lhe escrevam. Pode continuar a candidatar-se às vagas delas.',
      ],
      mistakes: [
        'Mudar o nome ou a validade de um certificado retira as confirmações e verificações: eram para o certificado como estava.',
        'Viu um perfil falso ou uma vaga duvidosa? Toque em Denunciar por baixo. Deixa de a ver de imediato e a AVX analisa; ninguém sabe quem denunciou.',
      ],
    },
    'crew-profile': {
      title: 'Seja encontrado para trabalhar com o seu perfil profissional',
      intro: 'As empresas no AVX podem encontrá-lo pelo que faz, onde está e as línguas que fala. Fica desligado até o ligar.',
      steps: [
        'Abra as Definições (as suas iniciais no topo), escolha Perfil e toque em "Abrir o seu perfil profissional".',
        'Escolha o que faz, escreva a sua localidade e toque em Localizar para a escolher, e depois diga até onde se desloca e em que línguas trabalha. Acrescente certificados e ligações, se quiser.',
        'Escolha quem o pode ver (só empresas, ou empresas e técnicos), marque "Deixar que encontrem o meu perfil" e guarde. A pré-visualização no fim mostra o que vão ver.',
      ],
      mistakes: [
        'Não ponha preços no perfil: só indica o seu preço por dia quando responde a uma empresa.',
        'Só se guarda a sua localidade, não a morada. Para o esconder outra vez, desmarque e guarde; "Remover o meu perfil profissional" apaga-o por completo.',
      ],
    },
    'crew-unavailable': {
      title: 'Marcar as datas em que não pode trabalhar',
      intro: 'Férias, outro trabalho, uma consulta: marque-as uma vez e os diretores de produção são avisados antes de o marcarem.',
      steps: [
        'Em "O meu trabalho", abra Disponibilidade. No telemóvel, está em Mais.',
        'Em "Datas indisponíveis", escolha o primeiro dia em De. Se for mais de um dia, escolha o último em Até. Se quiser, escreva uma nota para si.',
        'Toque em "Adicionar datas". Para as tirar mais tarde, toque no × ao lado.',
      ],
      mistakes: [
        'Os diretores de produção não veem a sua nota nem o motivo, só que não está disponível. Podem marcá-lo na mesma, mas o AVX aconselha-os a falar consigo primeiro.',
      ],
    },
    'crew-availability': {
      title: 'Responder a uma pergunta de disponibilidade',
      intro: 'Antes de o marcar, um diretor de produção pode perguntar se está livre. Responder é um toque.',
      steps: [
        'Recebe uma notificação: alguém pergunta se está disponível para um evento.',
        'Em "O meu trabalho", as perguntas aparecem no topo. Se precisar, escreva uma nota (por exemplo "só a partir das 10:00") e toque em Disponível ou Indisponível.',
        'A pergunta também aparece nas mensagens com essa pessoa, e pode responder aí.',
      ],
      mistakes: [
        'Responder "Disponível" ainda não o marca. Fica marcado quando o diretor de produção o adiciona ao evento.',
        'Uma chamada de equipa é diferente: oferece-lhe um lugar, e ficam com ele os primeiros a aceitar.',
      ],
    },
    'crew-chat': {
      title: 'Conversar com a equipa',
      intro: 'Cada evento tem uma conversa para todos os que estão nele. Também pode escrever diretamente a uma pessoa.',
      steps: [
        'Toque no balão de conversa, no topo, para abrir as Mensagens. As conversas com mensagens por ler aparecem primeiro.',
        'Abra a conversa do evento. Escreva na caixa em baixo e toque em Enviar. O clipe anexa fotografias e ficheiros; escreva @ para mencionar alguém.',
        'Abra o menu de uma mensagem para responder, reagir, guardar ou denunciar.',
        'Demasiadas notificações? Silencie a conversa no menu dela. Continua a ver as mensagens quando a abre.',
      ],
      mistakes: [
        'Toda a gente do evento lê a conversa do evento. Para assuntos privados, envie uma mensagem direta.',
        'Sem rede, as mensagens esperam no telemóvel e são enviadas quando voltar a ter ligação.',
      ],
    },
    'crew-damage': {
      title: 'Reportar equipamento danificado',
      intro: 'Algo se partiu no local? Avise logo o armazém, para ser reparado antes do próximo trabalho.',
      steps: [
        'Em "O meu trabalho", toque em "Reportar dano" no seu próximo evento. Para outro evento, abra-o, toque em Equipamento e depois em "Reportar dano".',
        'Escolha o artigo. Para equipamento com etiqueta própria, escreva o código da etiqueta. Para cabos e outros artigos contados, diga quantos.',
        'Diga o que se passa e junte uma fotografia, se puder. Toque em Enviar. Os administradores da organização são avisados.',
      ],
      mistakes: [
        'Reporte mesmo que pareça pouco. Um conector solto hoje é um canal morto no próximo espetáculo.',
        'Não continue a usar equipamento que não seja seguro, sobretudo o que liga à corrente.',
      ],
    },
    'crew-appearance': {
      title: 'Tornar o AVX mais fácil de ler',
      intro: 'Sol forte, ecrã pequeno, olhos cansados: mude o aspeto do AVX neste telemóvel ou computador.',
      steps: [
        'Toque nas suas iniciais, no canto superior direito, para abrir as Definições, e escolha "Língua e aparência".',
        'Em Aparência, escolha o tema: Claro para o sol, Alto contraste para a maior diferença, ou Como o dispositivo. Escolha também o tamanho do texto.',
        'Ligue o Modo confortável para botões maiores (com luvas, em movimento) e a letra fácil de ler se as letras se confundirem. O Modo simples mostra só o seu próximo evento e o que precisa para ele; liga-se sozinho para a equipa técnica.',
      ],
      mistakes: [
        'Estas escolhas ficam guardadas em cada dispositivo. Volte a escolhê-las no seu outro telemóvel ou computador.',
      ],
    },
    'crew-offline': {
      title: 'Usar o AVX sem rede',
      intro: 'Recintos e caves muitas vezes não têm rede. Prepare-se antes de sair e o evento fica no telemóvel.',
      steps: [
        'Enquanto ainda tem rede, abra o evento. O AVX guarda uma cópia neste telemóvel.',
        'Abra Ficheiros e toque em "Guardar todos os ficheiros offline" para guardar também riders, plantas e outros ficheiros.',
        'Sem rede, uma barra no topo avisa que está offline e o AVX mostra a cópia guardada.',
        'As mensagens que escrever offline são enviadas quando voltar a ter ligação. As outras alterações precisam de ligação.',
      ],
      mistakes: [
        'Um evento que nunca abriu neste telemóvel não está guardado. Abra-o uma vez antes de sair.',
        'Os ficheiros são guardados em cada telemóvel. Guardá-los no computador não os guarda no telemóvel.',
      ],
    },
    'pm-create-gig': {
      title: 'Criar um evento',
      intro: 'Um evento reúne tudo sobre um trabalho: equipa, horário, equipamento, ficheiros e conversa.',
      steps: [
        'No topo, escolha a empresa a que o evento pertence.',
        'Toque em "Novo evento" (no telemóvel, em Mais). Escreva o nome e o local e escolha as datas de início e de fim.',
        'Escolha o estado: Rascunho enquanto não é certo, Confirmado quando vai acontecer. Toque em "Criar evento" e depois adicione a equipa, o horário e o equipamento.',
      ],
      mistakes: [
        'Sem datas, o AVX não consegue avisar de marcações duplas nem ver se há equipamento suficiente.',
        'Se o cliente aceitou um orçamento, abra o evento e use "Preencher evento a partir do orçamento" para juntar horário, posições e equipamento de uma vez.',
      ],
    },
    'pm-post-job': {
      title: 'Publicar uma vaga e escolher quem levar',
      intro: 'Precisa de pessoas que ainda não conhece? Publique a vaga: os freelancers no AVX que encaixam veem-na e candidatam-se.',
      steps: [
        'No separador Equipa do evento, toque em "Publicar uma vaga" (ou Organização → Vagas publicadas). Escolha a posição da equipa ou escreva um título, a função, a localidade e o pagamento ("Pedir o preço por dia" ou um valor indicado). Precisa do início de sessão em dois passos ligado.',
        'As candidaturas chegam às suas mensagens e a Vagas publicadas → Candidatos, com o perfil profissional, a mensagem e o preço de cada pessoa.',
        'Ponha na lista final, recuse (com uma nota simpática) ou "Ofereça o lugar": se aceitar, entra no evento com essa função e a vaga fecha quando todos os lugares estiverem ocupados.',
      ],
      mistakes: [
        'A vaga não mostra o nome do evento nem o cliente, só a vossa organização, as datas e a localidade. Feche-a se os planos mudarem.',
        'Enquanto a organização não estiver verificada, pode ter 3 vagas abertas de cada vez. Um administrador verifica-a nas definições da organização → Verificação.',
      ],
    },
    'pm-find-crew': {
      title: 'Encontrar técnicos com quem ainda não trabalhou',
      intro: 'Falta um rigger no Porto no próximo sábado? Pesquise os freelancers no AVX que deixaram o perfil visível para empresas.',
      steps: [
        'Abra o separador Equipa do evento e toque em "Procurar técnicos" (ou Organização → Procurar técnicos). As datas do evento ficam preenchidas.',
        'Escolha uma função, escreva a localidade do local e toque em Localizar, escolha a distância e marque "Só pessoas livres nestas datas", se quiser. Toque em Procurar.',
        'Num resultado, toque em "Perguntar se está livre" para confirmar as datas, ou em "Oferecer um lugar" para lhe oferecer o trabalho. A resposta chega às suas mensagens; se aceitar uma oferta, entra no evento.',
      ],
      mistakes: [
        'Os perfis não têm preços: combine o valor nas mensagens. O e-mail e o telefone só são partilhados quando a pessoa entra no evento.',
        'As pesquisas e os primeiros contactos têm um limite diário para evitar abusos. As pessoas com quem já trabalhou continuam fáceis de chamar no formulário de convite do evento.',
        'Procura muitas vezes o mesmo tipo de pessoa? Toque em "Guardar esta pesquisa" e mantenha o alerta ativo: é avisado quando alguém que se ajusta ativa o perfil. As pesquisas guardadas aparecem acima do formulário para toda a organização.',
      ],
    },
    'pm-invite-crew': {
      title: 'Convidar a equipa',
      intro: 'Adicione pessoas a um evento para verem o horário, os ficheiros e a conversa. Pode convidar qualquer pessoa por email.',
      steps: [
        'Abra o evento, toque em Equipa e depois em "Convidar equipa".',
        'Procure pessoas com quem já trabalhou, ou escreva um email.',
        'Escreva a função (por exemplo "Técnico de FOH"), escolha o nível de acesso (Equipa técnica para a maioria) e a hora de chamada. Toque em "Adicionar ao evento".',
        'Quem não tem conta recebe um email e fica pendente até se registar. Para oferecer um lugar a várias pessoas de uma vez, use "Chamada de equipa".',
      ],
      mistakes: [
        'O acesso de Diretor de Produção permite alterar tudo no evento. Dê-o só a quem o gere consigo.',
        'Um sinal de aviso ao lado de alguém quer dizer que já está marcado ou indisponível nessa altura. Pergunte-lhe primeiro.',
      ],
    },
    'pm-schedule': {
      title: 'Montar o horário',
      intro: 'O horário é o alinhamento que toda a gente do evento vê: carga, soundcheck, abertura de portas, espetáculo, desmontagem.',
      steps: [
        'Abra o evento, toque em Horário e depois em Adicionar.',
        'Escreva o que acontece e escolha o dia, as horas de início e de fim e o local. Junte notas, se precisar, e guarde.',
        'Toda a gente do evento vê o horário logo, e as alterações aparecem na conversa do evento.',
      ],
      mistakes: [
        'O horário é do evento todo. A hora a que cada pessoa começa é a hora de chamada, definida em Equipa.',
      ],
    },
    'pm-call-sheet': {
      title: 'Preparar e enviar a folha de serviço',
      intro: 'A folha de serviço junta numa página o horário, a equipa, as horas de chamada e os telefones.',
      steps: [
        'Preencha primeiro o horário e a hora de chamada de cada pessoa.',
        'Abra o evento, toque em Horário e depois em "Folha de serviço".',
        'Toque em "Enviar à equipa" para a publicar na conversa do evento, ou em "Imprimir / Guardar como PDF".',
        'Na conversa do evento, veja quem já confirmou que a leu.',
      ],
      mistakes: [
        'Os telefones só aparecem para quem os pôs na sua conta.',
        'Se o horário mudar depois de enviar, envie outra vez para todos confirmarem a nova versão.',
      ],
    },
    'pm-double-booking': {
      title: 'Evitar marcações duplas',
      intro: 'O AVX avisa quando alguém já está marcado ou marcou essas datas como indisponíveis. Nada é bloqueado; a decisão é sua.',
      steps: [
        'Em Equipa, um sinal de aviso ao lado de uma pessoa quer dizer que está marcada noutro sítio ou indisponível à mesma hora.',
        'Antes de adicionar alguém, toque em "Perguntar disponibilidade". A pessoa responde disponível ou indisponível, com uma nota.',
        'Se alguém só é preciso parte do dia, defina as horas da marcação ("Definir horas") para que trabalhos curtos no mesmo dia não colidam.',
        'As suas próprias sobreposições aparecem como "Marcação dupla" nos seus eventos.',
      ],
      mistakes: [
        'Perguntar não marca ninguém. Adicione a pessoa ao evento quando ela disser que sim.',
        'Sem horas de marcação, a pessoa conta como marcada durante todo o dia de cada dia do evento.',
      ],
    },
    'pm-patch': {
      title: 'Fazer o patch das stage boxes',
      intro: 'O patch diz em que entrada de stage box vai cada linha de input, para a equipa de palco ligar e a mesa receber o canal certo.',
      steps: [
        'Faça primeiro a lista de inputs. Depois, em Ferramentas, "Adicionar ferramenta" → Patch.',
        'Toque em "Adicionar stage box" para cada caixa (SB1, SB2…), indique o número de entradas e marque "Split para monitores" se também alimenta a mesa de monitores.',
        'Para cada entrada, escolha a linha que lá vai, ou toque em "Preencher as entradas livres" para pôr as linhas que faltam por ordem de canal.',
        'Imprima o patch para o palco. A entrada também aparece na lista de inputs, na coluna Stage box.',
      ],
      mistakes: [
        'Duas linhas na mesma entrada ficam marcadas a laranja: escolha uma delas para essa entrada.',
        'Remover uma stage box não apaga linhas: voltam a ficar "sem entrada".',
      ],
    },
    'pm-dmx': {
      title: 'Fazer o patch DMX',
      intro: 'O patch DMX dá a cada projetor um universo e um endereço, para cada um responder à mesa sem chocar com outro.',
      steps: [
        'Em Ferramentas, "Adicionar ferramenta" → Patch DMX, e depois "Adicionar projetores".',
        'Escolha o tipo (ou um artigo do catálogo), o modo e quantos canais usa, quantos tem e o universo. Cada um recebe o próximo endereço livre.',
        'Veja a lista por universo: o intervalo à esquerda são os canais de cada projetor. As sobreposições ficam marcadas a laranja.',
        'Imprima-o para a equipa de luz, que configura o endereço de cada projetor no local. "Juntar ao equipamento" prevê no evento os projetores ligados ao catálogo.',
      ],
      mistakes: [
        '"Reendereçar por ordem" dá novos endereços a um universo inteiro: use-o só antes de os projetores estarem configurados.',
        'O número de canais depende do modo: confirme no manual do projetor.',
      ],
    },
    'pm-system-calc': {
      title: 'Calcular os delays do PA',
      intro: 'A calculadora de sistema de som estima o delay de cada torre de delay, fill e sub, o nível em cada posição de escuta e a largura que cada fonte cobre, a partir de onde está cada coisa.',
      steps: [
        'Em Ferramentas, "Adicionar ferramenta" → Calculadora de sistema de som. Indique a temperatura do ar e a margem Haas.',
        'Adicione as fontes: principais, subs, delays e fills. Para cada uma indique o sítio (lateral, frente/fundo, altura), o SPL máximo e o ângulo horizontal da ficha técnica, e quantas caixas.',
        'Adicione as posições de escuta, primeiro a régie: é a referência para alinhar os subs. Depois o fundo da sala e onde tiver dúvidas.',
        'Leia o delay de cada fonte e as verificações em cada posição: um delay que chega antes da principal, ou mais de 30 ms depois, fica assinalado. Imprima para o técnico de sistema e depois meça no local.',
      ],
      mistakes: [
        'São estimativas sem reflexões, com todas as caixas apontadas de frente para o público: confirme sempre com um sistema de medição.',
        'Frente/fundo é negativo para o lado do público: uma torre de delay a 30 m está em −30.',
      ],
    },
    'pm-light-plot': {
      title: 'Desenhar o plano de luz',
      intro: 'O plano de luz mostra as truss, varas e posições de chão sobre o palco, com cada projetor do patch DMX pendurado nelas, e soma a potência por fase.',
      steps: [
        'Em Ferramentas, "Adicionar ferramenta" → Plano de luz. Em "Adicionar uma posição", junte uma truss ou vara por cada vara; arraste-a para o lugar e indique o nome, o comprimento e a altura.',
        'Selecione uma vara e toque em "Adicionar projetores aqui": entram no patch DMX em endereços livres e ficam pendurados nessa vara, distribuídos por igual. Os projetores que já estão no patch DMX podem ser pendurados a partir da lista "fora do plano".',
        'Arraste um projetor para o mover ao longo da vara, ou para outra vara. Cada um mostra por baixo o universo/endereço.',
        'Indique a alimentação (fases e amperes) e dê uma fase a cada vara: a secção de potência mostra a carga em cada fase, como estimativa. Imprima o plano para a equipa.',
      ],
      mistakes: [
        'A potência é uma estimativa a partir dos valores dos projetores: os que não têm valor contam como 0 W. Confirme a alimentação real com o eletricista.',
        'Remover uma posição não apaga os projetores: passam para "fora do plano" (e continuam no patch DMX).',
      ],
    },
    'pm-stage-plot': {
      title: 'Desenhar o stage plot',
      intro: 'O stage plot mostra onde fica cada coisa em palco. A bateria, os microfones, os amplificadores e as DIs que colocar passam a ser os canais da lista de inputs.',
      steps: [
        'Abra o evento, toque em Ferramentas, "Adicionar ferramenta" e escolha Stage plot. Indique a largura e a profundidade do palco.',
        'Em "Adicionar ao palco", toque no que precisa: bateria, microfone de voz, amplificadores, teclado, monitores, um estrado. Arraste cada um para o lugar, ou selecione-o e use os botões de setas; Rodar vira-o.',
        'Dê nomes às coisas ("Ana", "Solista") para a equipa saber de quem é cada uma. A lista por baixo do desenho diz onde está cada uma.',
        'Toque em "Enviar para a lista de inputs": cada canal de que o plot precisa é adicionado, numerado a seguir aos que já lá estão. Imprima o plot para o palco e para a sala.',
      ],
      mistakes: [
        'O público está em baixo no desenho, como na maioria dos riders: "esquerda" é a esquerda do palco vista pelo público.',
        'Enviar outra vez só adiciona os canais novos; nunca altera os que já estão na lista de inputs.',
      ],
    },
    'pm-input-list': {
      title: 'Fazer a lista de inputs',
      intro: 'A lista de inputs diz à equipa de som o que entra em cada canal da mesa. Toda a gente no evento a pode ler no telemóvel, mesmo sem rede.',
      steps: [
        'Abra o evento, toque em Ferramentas, depois em "Adicionar ferramenta" e escolha Lista de inputs.',
        'Toque em "Adicionar input" para cada canal: a fonte (Bombo dentro, Voz principal), o microfone ou DI, o tripé, a entrada da stage box, e marque 48V se precisar de alimentação phantom.',
        'Use as setas para mudar a ordem; os canais são renumerados por si. Imprima-a para a mesa e para o palco.',
        'No local, marque cada linha à medida que é verificada. Se os microfones vêm do catálogo, "Juntar microfones e DIs ao equipamento" prevê-os no evento.',
      ],
      mistakes: [
        'Duas linhas não podem partilhar um canal. Mova uma primeiro, ou escolha um número livre.',
        'A equipa pode ler a lista mas não a alterar: fale com o diretor de produção.',
      ],
    },
    'pm-equipment': {
      title: 'Planear o equipamento',
      intro: 'Liste o material de que o evento precisa. O AVX reserva-o para as datas e avisa se não houver que chegue.',
      steps: [
        'Abra o evento, toque em Equipamento e depois em "Adicionar equipamento".',
        'Marque os artigos e escolha as quantidades. Cada um mostra quantos estão livres nas datas do evento, mais os dias de preparação e de devolução.',
        'Se faltar um artigo, alugue-o fora, troque-o por uma alternativa ou mude a quantidade. Nada é bloqueado.',
        'Se o evento vem de um orçamento aceite, "Preencher evento a partir do orçamento" junta o equipamento por si.',
      ],
      mistakes: [
        'Mudar as datas do evento muda também a reserva do equipamento. Volte a ver o separador Equipamento depois.',
      ],
    },
    'wh-import': {
      title: 'Importar o equipamento de uma folha de cálculo ou de outra ferramenta',
      intro: 'Traga os locais, o catálogo, os números de série e os kits para o AVX de uma vez, a partir de uma exportação Excel ou CSV (Rentman, outra ferramenta de aluguer ou uma folha de cálculo), em vez de os escrever.',
      steps: [
        'Em Inventário, toque em Importar. Importe por esta ordem: locais, depois equipamento, depois unidades (números de série), depois conteúdos dos kits, porque cada um se refere aos anteriores.',
        'Escolha o que vai importar e depois o ficheiro (Excel .xlsx ou CSV; do Excel é lida a primeira folha), ou cole as linhas da folha de cálculo (com os títulos).',
        'O AVX adivinha o que é cada coluna, também a partir de títulos em neerlandês ou inglês. Confirme e corrija o que estiver errado. Guarde a correspondência com um nome ("Exportação de equipamento do Rentman") para o próximo ficheiro não precisar de nada.',
        'A verificação mostra o que é novo, o que corresponde ao que já está no AVX e que linhas têm problemas (ficam de fora). Importe e leia o relatório. Corrija as linhas ignoradas no ficheiro e importe-o de novo: o que já está no AVX é reconhecido, não duplicado.',
      ],
      mistakes: [
        'Ficheiros Excel antigos (.xls) e outros formatos de folha de cálculo têm de ser guardados primeiro como .xlsx ou CSV, ou copie as linhas e cole-as.',
        'Uma importação pode ser anulada em "Importações anteriores" só enquanto nada tiver usado o que ela adicionou (um evento, uma leitura, um kit). Anular remove de vez o que ela adicionou.',
      ],
    },
    'wh-locations': {
      title: 'Configurar os locais',
      intro: 'Os locais são onde o equipamento fica: armazéns, carrinhas, recintos. O stock conta-se sempre por local.',
      steps: [
        'Abra Inventário → Locais e toque em "Adicionar local".',
        'Escreva o nome, escolha o tipo (armazém, veículo, local / recinto, outro) e junte a morada, se for útil.',
        'Para passar stock de um local para outro, abra o artigo e use Mover. Todas as alterações ficam registadas em Movimentos.',
      ],
      mistakes: [
        'Os locais são arquivados, não apagados, para o histórico ficar completo. Arquive um local só quando já nada ficar lá.',
      ],
    },
    'wh-units-labels': {
      title: 'Adicionar unidades e imprimir etiquetas QR',
      intro: 'No equipamento registado um a um, cada unidade tem o seu número de série, código QR e estado.',
      steps: [
        'Abra o artigo no catálogo e toque em "Adicionar unidades". Cole os números de série, um por linha, e junte os dados de compra se os tiver.',
        'Marque as unidades para as quais quer etiquetas, ou abra Inventário → Etiquetas QR para tudo.',
        'Escolha o tamanho da etiqueta e toque em Imprimir. Cole cada etiqueta na sua unidade; ao lê-la mais tarde, a unidade abre no AVX.',
      ],
      mistakes: [
        'Os artigos contados a granel (cabos, grampos) têm uma etiqueta para o artigo, não uma por peça.',
        'Imprima primeiro uma página de teste em papel normal e veja se as etiquetas acertam com as suas folhas.',
      ],
    },
    'wh-scan': {
      title: 'Dar saída de equipamento para um evento',
      intro: 'Ler as saídas regista exatamente o que saiu do armazém para cada evento, para nada ficar esquecido no regresso.',
      steps: [
        'Abra o evento, toque em Equipamento e depois em "Lista de carga" para preparar tudo o que está previsto.',
        'Toque em "Saída / entrada" e escolha "Saída para o evento". Leia cada etiqueta com a câmara, ou escreva o código. Nos artigos a granel, indique primeiro a quantidade.',
        'Acompanhe o progresso ("Carregado 32 de 40"). Um flight case lê tudo o que vai dentro dele.',
        'Na carrinha ou no escuro, toque em "Modo de leitura": o ecrã inteiro passa a botões grandes, a câmara e a última leitura em letra grande. Cada leitura apita e vibra: um apito agudo está bem, dois apitos são um aviso, um zumbido grave é um problema. O botão da lanterna ilumina a etiqueta (em telemóveis Android).',
      ],
      mistakes: [
        'Removeu algo por engano? A maior parte das remoções mostra "Anular" durante uns segundos antes de apagar.',
        'O AVX avisa quando algo não está previsto para o evento ou passa do previsto. Regista na mesma, por isso leia o aviso.',
        'Um leitor de códigos USB ou Bluetooth também funciona: escreve o código e carrega em Enter por si.',
      ],
    },
    'wh-steps': {
      title: 'Seguir o equipamento etapa a etapa',
      intro: 'Entre o armazém e o regresso, o equipamento passa por etapas: preparado, saída (carregado), no local, carregado no regresso, entrada e verificado. Cada leitura avança uma etapa, para toda a gente saber onde está o material.',
      steps: [
        'Em "Saída / entrada", escolha a etapa em cima e depois leia. "Saída (carregado)" e "Entrada" são a saída e a entrada; as outras só registam a etapa. Um flight case leva tudo o que vai dentro dele.',
        'O separador Equipamento do evento mostra uma barra por etapa ("66 de 69 saída").',
        'A lista de carga mostra até onde chegou cada linha, na coluna Etapa.',
        'Um administrador escolhe as etapas que a empresa usa nas definições da organização. Uma equipa pequena pode usar só a saída e a entrada.',
      ],
      mistakes: [
        'Leu a coisa errada? Carregue em Anular nessa leitura. Funciona nas suas leituras durante 15 minutos, e não numa entrada danificada (essa abriu uma reparação).',
        'Uma etapa que salte é preenchida pelas seguintes: uma unidade que deu entrada conta como tendo saído.',
      ],
    },
    'wh-returns': {
      title: 'Dar entrada do equipamento no regresso',
      intro: 'Quando o evento regressa, ler as entradas mostra o que voltou, o que falta e o que voltou danificado.',
      steps: [
        'Abra "Saída / entrada" do evento, escolha "Entrada (regresso)" e leia tudo o que voltou.',
        'Se algo voltou danificado, marque "Voltou danificado" antes de o ler. Vai para reparação e o armazém é avisado.',
        'As unidades que continuam fora aparecem no fim. Se se perderam mesmo, marque-as como perdidas.',
      ],
      mistakes: [
        'Não marque unidades como perdidas no primeiro dia: podem estar ainda numa carrinha. Se uma aparecer mais tarde, dar-lhe entrada devolve-a ao stock.',
      ],
    },
    'wh-repairs': {
      title: 'Reparações e inspeções',
      intro: 'Saiba o que está avariado, o que está a ser reparado e que unidades precisam de inspeção (elétrica, rigging).',
      steps: [
        'Abra Inventário → Manutenção. Aqui estão as reparações abertas, os danos reportados pela equipa e as inspeções em atraso.',
        'Toque em "Nova reparação" para registar uma avaria. Acompanhe-a de reportado a em reparação e feche-a como reparado ou abatido, com o custo.',
        'Para uma inspeção, toque em "Registar inspeção" na unidade e escolha Aprovado ou Reprovado.',
      ],
      mistakes: [
        'Uma inspeção reprovada abre uma reparação e tira a unidade de uso até ser reparada.',
        'Abater uma unidade é definitivo no seu histórico. Faça-o só quando a unidade nunca mais voltar.',
      ],
    },
    'wh-subrentals': {
      title: 'Alugar equipamento fora (sub-alugueres)',
      intro: 'Quando falta material, alugue-o a outra empresa e o AVX conta-o como stock nessas datas.',
      steps: [
        'Abra Inventário → Sub-alugueres e toque em "Novo sub-aluguer".',
        'Escolha o fornecedor (ou crie um novo), o evento e as datas. Em "O que está a alugar", junte as linhas, ligadas aos artigos do seu catálogo.',
        'Passe-o de rascunho a pedido e depois a confirmado à medida que o fornecedor responde.',
        'Se o fornecedor também usa o AVX, ligue-o com o código de cross-hire dele e envie-lhe o pedido diretamente.',
      ],
      mistakes: [
        'Um sub-aluguer só conta como stock nas datas que cobre por inteiro.',
        'As linhas não ligadas a um artigo do catálogo não contam na disponibilidade.',
      ],
    },
    'wh-reports': {
      title: 'Ler os relatórios do inventário',
      intro: 'Veja que equipamento compensa: uso, receita, custos de reparação e valor contabilístico por artigo.',
      steps: [
        'Abra Inventário → Relatórios e escolha o período.',
        'Os quadros no topo resumem receita, valor contabilístico, reparações, perdas e custos de aluguer fora. A tabela mostra cada artigo.',
        '"Sem uso neste período" lista artigos a vender, alugar ou deixar de comprar. "Descarregar CSV" abre-o numa folha de cálculo.',
      ],
      mistakes: [
        'O uso conta só eventos confirmados. A receita vem dos orçamentos aceites; veja "Como se conta" no fim.',
      ],
    },
    'of-company': {
      title: 'Configurar os dados da empresa',
      intro: 'Os seus dados aparecem no topo de cada orçamento. Configure-os uma vez; os novos orçamentos usam-nos.',
      steps: [
        'Abra Orçamentos → Dados da empresa (só os administradores os podem alterar).',
        'Preencha o nome legal, o NIF, a morada, o telefone e o site, o IVA predefinido e a validade dos orçamentos.',
        'Escreva os seus termos e condições habituais e guarde.',
      ],
      mistakes: [
        'As alterações aplicam-se aos novos orçamentos. Os que já enviou mantêm os dados com que foram enviados.',
      ],
    },
    'of-price-list': {
      title: 'Criar a tabela de preços',
      intro: 'A tabela de preços guarda o que orçamenta muitas vezes (equipamento, equipa, transporte) com o preço habitual.',
      steps: [
        'Abra Orçamentos → Tabela de preços e toque em "Adicionar item", ou em "Importar lista" para colar muitos de uma vez de uma folha de cálculo.',
        'Dê a cada um nome, preço sem IVA, categoria, tipo e unidade (dia, hora, km).',
        'Num orçamento, "Da tabela de preços" junta como linhas os itens que marcar.',
      ],
      mistakes: [
        'Mudar um preço só afeta linhas novas. Os orçamentos que já usam o item mantêm o preço.',
      ],
    },
    'of-contacts': {
      title: 'Guarde os clientes e fornecedores nos Contactos',
      intro: 'Escreva um cliente uma vez e escolha-o em cada orçamento. Os fornecedores também estão aqui, para os sub-alugueres.',
      steps: [
        'Abra Contactos (no menu Orçamentos). Clientes e Fornecedores têm cada um o seu separador. Toque em "Novo cliente" para adicionar um: empresa ou nome, pessoa de contacto, e-mail, telefone, NIF e morada.',
        'Vem de outra ferramenta ou de uma folha de cálculo? Toque em Importar e traga-os da exportação. Já tem orçamentos? "Adicionar aos contactos" transforma os clientes escritos neles em contactos e liga esses orçamentos.',
        'Num orçamento, em Detalhes, escolha o cliente em "Cliente dos contactos": os dados dele são preenchidos. Um cliente escrito à mão pode ser guardado com "Guardar nos contactos".',
        'Abra um cliente para ver os orçamentos dele. Arquive os que já não trabalham consigo: ficam nos orçamentos antigos mas saem das listas.',
      ],
      mistakes: [
        'Alterar um cliente nos Contactos não altera orçamentos já feitos: cada orçamento guarda os dados com que foi enviado. Escolha de novo o cliente num rascunho para os atualizar.',
        'Ao importar, dois contactos com o mesmo nome distinguem-se pelo NIF ou pelo e-mail. Junte o NIF para evitar duplicados.',
      ],
    },
    'of-import-jobs': {
      title: 'Traga os próximos trabalhos e os orçamentos em aberto',
      intro: 'Importe os trabalhos que ainda tem por fazer, o equipamento planeado neles e os orçamentos à espera de resposta, a partir das exportações da ferramenta antiga. Os trabalhos passados ficam na exportação da ferramenta antiga, como arquivo.',
      steps: [
        'Importe primeiro o catálogo de equipamento (Inventário → Importar). Depois, no mesmo sítio, escolha Próximos trabalhos e a exportação dos trabalhos: cada trabalho passa a evento, com datas, local e estado.',
        'A verificação mostra que trabalhos são novos, quais correspondem a eventos já no AVX (pelo número do trabalho) e quais ficam de fora: passados, cancelados ou sem data de início.',
        'A seguir, Equipamento nos trabalhos: uma linha por item, com o número do trabalho e o código do artigo. Reserva o material para as datas do evento. Depois veja no separador Equipamento de cada evento se algo está reservado em duplicado.',
        'Orçamentos em aberto: uma linha por linha de orçamento, com o número do orçamento. Cada um fica em rascunho; abra-o para verificar o cliente, os preços e as datas antes de enviar.',
      ],
      mistakes: [
        'Volte a importar o mesmo ficheiro depois de mudanças na ferramenta antiga: eventos e orçamentos correspondem pelo número, por isso são atualizados, não duplicados. Um orçamento já enviado do AVX fica como está.',
        'Os conjuntos não se planeiam diretamente num evento: planeie o conteúdo, como o AVX faz quando adiciona um conjunto à mão.',
      ],
    },
    'of-build-quote': {
      title: 'Fazer um orçamento por fases',
      intro: 'Divida o orçamento em fases (carga, dias de espetáculo, desmontagem), cada uma com secções e linhas com preço.',
      steps: [
        'Abra Orçamentos, toque em "Novo orçamento", escreva o título e o cliente e comece em branco ou a partir de um modelo.',
        'Dê nome à primeira fase e defina as datas. Junte secções (Som, Luz, Equipa) e linhas, da tabela de preços ou escritas à mão.',
        'Use o fator para dias ou horas (3 dias = fator 3) e um desconto por linha, por fase ou no total.',
        'Em Detalhes, confirme o cliente, o IVA e a validade. "Pré-visualizar e imprimir" mostra o que o cliente vai ver.',
      ],
      mistakes: [
        'Uma fase opcional tem preço à parte e fica fora do total. Use-a para extras que o cliente possa querer.',
        'O orçamento guarda-se sozinho. Se outra pessoa o editar ao mesmo tempo, o AVX pede-lhe para recarregar.',
      ],
    },
    'of-versions': {
      title: 'Guardar versões de um orçamento',
      intro: 'Uma versão é uma cópia fixa do orçamento tal como o cliente o veria. Pode voltar a ela quando quiser.',
      steps: [
        'Antes de uma grande alteração, abra o orçamento e toque em Versões.',
        'Escreva uma nota (por exemplo "Antes de cortar o ecrã LED") e toque em "Guardar versão". Cada orçamento enviado também fica guardado como versão.',
        'Para voltar atrás, abra uma versão com Ver e depois Repor. O que tem agora é guardado primeiro como nova versão.',
      ],
      mistakes: [
        'Repor substitui o orçamento todo, não uma linha. Copie as linhas que quer manter antes de repor.',
      ],
    },
    'of-send-quote': {
      title: 'Enviar um orçamento ao cliente',
      intro: 'O cliente recebe um link privado para o orçamento, onde o pode imprimir e aceitar ou recusar.',
      steps: [
        'Confirme o orçamento em "Pré-visualizar e imprimir".',
        'Toque em "Enviar ao cliente", escreva o email e toque em "Enviar orçamento". Para enviar o link por si, desmarque o email e toque em "Criar link".',
        'É avisado quando o cliente aceita ou recusa. O cliente também lhe pode escrever a partir da página do orçamento.',
      ],
      mistakes: [
        'O link só aparece uma vez. Se o perder, envie o orçamento outra vez; isso substitui o link antigo.',
        'O cliente vê o orçamento como estava quando o enviou. Depois de alterações, envie-o outra vez.',
      ],
    },
    'of-quote-to-gig': {
      title: 'Do orçamento aceite ao evento',
      intro: 'Quando o cliente aceita, transforme o orçamento num evento com horário, funções e equipamento.',
      steps: [
        'Abra o orçamento aceite e toque em "Criar evento". O evento recebe o título do orçamento, as datas e o nome do cliente, e fica ligado ao orçamento.',
        'O AVX propõe logo preencher o evento (mais tarde: "Preencher evento a partir do orçamento"). Desmarque o que não quer, ou mude títulos e números.',
        'Toque em "Adicionar ao evento": as fases passam a itens do horário, as linhas de equipa a funções por preencher e as linhas do catálogo a equipamento previsto.',
      ],
      mistakes: [
        'As fases opcionais que o cliente não escolheu ficam de fora. Junte-as à mão se forem aceites mais tarde.',
      ],
    },
    'ad-members': {
      title: 'Membros e funções da organização',
      intro: 'Os membros veem todos os eventos da organização. A equipa adicionada a um só evento não precisa de ser membro.',
      steps: [
        'Abra Membros (no telemóvel, em Mais).',
        'Escreva um email, escolha a função e toque em Convidar. Administrador: tudo, incluindo membros e definições. Membro: eventos, ficheiros e orçamentos. Leitor: vê os eventos, sem orçamentos nem preços.',
        'Mude a função na lista ao lado de cada pessoa, ou retire-a com ×.',
      ],
      mistakes: [
        'Tenha pelo menos dois administradores, para a empresa nunca ficar sem acesso se um sair.',
        'Os leitores nunca veem preços. Use Leitor para clientes ou parceiros que só precisam do horário.',
      ],
    },
    'ad-import-crew': {
      title: 'Traga a sua equipa de outra ferramenta',
      intro: 'Importe as suas pessoas de uma folha de cálculo ou da exportação de outra ferramenta. Ficam como convites em espera até os enviar, por isso ninguém recebe e-mails de surpresa.',
      steps: [
        'Em Membros, toque em "Importe a sua equipa de um ficheiro" (ou Inventário → Importar → Equipa). Escolha o ficheiro: uma linha por pessoa, com pelo menos um endereço de e-mail.',
        'Verifique as colunas adivinhadas: nome (ou primeiro nome e apelido), telefone, funções e papel. Os papéis são lidos como administrador, membro ou leitor; freelancers e técnicos ficam leitores.',
        'De volta a Membros, as pessoas importadas aparecem como ainda não convidadas. Verifique cada papel, selecione quem convidar e toque em Enviar. Descarte quem não quiser.',
      ],
      mistakes: [
        'Um leitor vê todos os eventos da empresa. Para um freelancer que só contrata de vez em quando, descarte a importação e adicione-o a um evento por e-mail.',
        'Quem já é membro ou já foi convidado fica de fora. Um convite que não pôde ser enviado fica na lista para tentar de novo.',
      ],
    },
    'ad-verify-company': {
      title: 'Verificar a sua empresa',
      intro: 'Uma empresa verificada tem um selo nas suas vagas, para que os freelancers saibam que é real, e pode ter mais de 3 abertas ao mesmo tempo.',
      steps: [
        'Abra as definições da organização (só administradores) e procure Verificação.',
        'Na UE: escolha o país, escreva o número de IVA e toque em "Validar no VIES". O serviço da UE responde de imediato; se o número for válido, a empresa fica logo verificada, com o nome que o VIES tem junto ao selo.',
        'Fora da UE, ou se o VIES não confirmar: escreva como a AVX pode verificar a empresa (número de registo, site) e envie. A resposta aparece no mesmo sítio.',
      ],
      mistakes: [
        'Às vezes o VIES não responde durante algum tempo. Tente mais tarde; pode validar 5 vezes por dia.',
        'Se várias pessoas denunciarem as suas vagas, as publicações ficam em pausa até a AVX analisar; entretanto as vagas ficam ocultas.',
      ],
    },
    'ad-org-export': {
      title: 'Descarregar todos os dados da organização',
      intro: 'Guarde uma cópia de tudo, ou leve-a para outra ferramenta. Nada o prende.',
      steps: [
        'Abra as definições da organização e desça até "Os dados da sua organização". Só os administradores a veem.',
        'Toque em "Descarregar tudo (zip)". Reúne cada tipo de registo à vez; mantenha a janela aberta até o zip descarregar.',
        'Abra o zip: um ficheiro de folha de cálculo (CSV) por tipo de registo, numerados pela ordem de que outra ferramenta precisa, mais as mensagens e um README que explica os ficheiros.',
      ],
      mistakes: [
        'Os ficheiros têm dados pessoais dos seus clientes e da sua equipa. Guarde-os num sítio seguro e apague-os quando já não precisar deles.',
        'Os ficheiros carregados, como riders e fotografias, aparecem listados mas não vão incluídos. Descarregue-os em cada evento.',
      ],
    },
    'ad-mute': {
      title: 'Silenciar uma organização ou uma conversa',
      intro: 'Trabalha para várias empresas? Silencie as que não precisa de acompanhar de perto.',
      steps: [
        'Abra Organizações e toque no sino ao lado de uma empresa para a silenciar: sem contador de não lidas nem resumo por email dela.',
        'Para silenciar só uma conversa, abra-a e toque no sino no topo ("Silenciar esta conversa").',
        'As perguntas enviadas a si (disponibilidade, chamadas de equipa) continuam a chegar mesmo em silêncio.',
      ],
      mistakes: [
        'Silenciar é só para si. Toda a gente na organização continua a receber as suas notificações.',
      ],
    },
    'ad-delete': {
      title: 'Apagar com segurança',
      intro: 'Apagar no AVX é definitivo: não há lixo. Na maior parte das vezes, arquivar é a melhor escolha.',
      steps: [
        'Para um evento que já terminou, mude o estado para Arquivado: sai das listas e mantém o histórico.',
        'Para apagar mesmo um evento, abra "Editar evento" e depois a Zona de perigo. Para uma organização, abra as Definições dela.',
        'Leia a lista do que vai ser apagado e marque que compreende.',
        'Espere alguns segundos, escreva o nome exato e toque em "Eliminar definitivamente".',
      ],
      mistakes: [
        'Descarregue primeiro o que precisa (mensagens, relatórios, orçamentos em PDF). Depois nada pode ser recuperado.',
        'Só os administradores da organização podem apagar. A equipa perde o acesso e é avisada.',
      ],
    },
    'ad-export': {
      title: 'Descarregar os seus dados',
      intro: 'Pode descarregar os seus próprios dados e, como administrador, as mensagens e os relatórios da organização.',
      steps: [
        'Os seus dados: toque nas suas iniciais para abrir as Definições, escolha "Os seus dados" e toque em "Exportar os meus dados".',
        'As mensagens da organização: abra Definições → Mensagens e toque em "Descarregar todas as mensagens". É aqui também que escolhe durante quanto tempo as mensagens são guardadas.',
        'Números do inventário: Inventário → Relatórios → "Descarregar CSV". Orçamentos: abra um e use "Pré-visualizar e imprimir" para guardar um PDF.',
      ],
      mistakes: [
        'Os ficheiros ficam no seu dispositivo. Guarde-os num sítio seguro: têm nomes e mensagens de outras pessoas.',
      ],
    },
  },
}

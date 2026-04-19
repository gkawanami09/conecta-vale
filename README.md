# Connecta Vale

O **Connecta Vale** é um MVP de navegação operacional em tempo real.  
O sistema permite solicitar rotas pelo WhatsApp, abrir um link de navegação no mapa, compartilhar localização em tempo real com autorização do usuário e gerenciar pontos operacionais/bloqueios por meio de um painel administrativo.

---

## Como testar pelo WhatsApp

Envie uma mensagem para o número:

**+55 11 5194-5106**

Você pode pedir rotas com mensagens naturais, por exemplo:

```text
Quero ir para o Pier 4
Quero ir para a subestação
Me manda a rota para a entrada vale
Como chego no ponto de ônibus?

Pontos já cadastrados para teste:

Pier 4
Subestação
Entrada Vale
Ponto de ônibus

Após enviar a mensagem, o sistema responderá com um link de navegação.

Uso da localização

Depois de receber o link pelo WhatsApp, abra o link e autorize o uso da localização.

Essa autorização é necessária para que o sistema consiga acompanhar a posição do usuário em tempo real no mapa.

O sistema segue as normas da LGPD, pois a localização só é utilizada após o consentimento do usuário. Caso o usuário não autorize, o compartilhamento em tempo real não será ativado.

Observação importante para iPhone

Em alguns iPhones, principalmente usando o Google Chrome, pode ocorrer bloqueio automático da localização pelo navegador.

Caso a localização não funcione corretamente, recomenda-se testar em outro navegador, principalmente o Safari.

Também é importante verificar se a permissão de localização está liberada nas configurações do navegador.

Área administrativa do gestor

O painel administrativo pode ser acessado pelo link:

https://conecta-vale.vercel.app/gestor

Credenciais de acesso:

Email: gestor@conecta-vale.local
Senha: Gestor@123
Funcionalidades do dashboard do gestor

Na área administrativa, o gestor pode:

visualizar no mapa todos os usuários que aceitaram compartilhar localização;
acompanhar a localização dos usuários em tempo real;
adicionar bloqueios operacionais no mapa;
adicionar novos pontos fixos/operacionais;
remover pontos criados;
visualizar os pontos fixos existentes;
simular alterações na operação e observar o impacto no sistema.
Como adicionar um bloqueio

Dentro do dashboard do gestor:

Clique em Adicionar bloqueio.
Clique em qualquer local do mapa onde deseja criar o bloqueio.
Na lateral do sistema, informe:
o nome do bloqueio;
o tamanho do bloqueio em metros.
Clique em Aplicar para confirmar o bloqueio.

Para desfazer antes de salvar, clique em Cancelar.

Após aplicado, o bloqueio passa a ser considerado pelo sistema e pode impactar as rotas dos usuários.

Como adicionar um ponto fixo

Dentro do dashboard do gestor:

Clique em Adicionar ponto.
Clique no local desejado no mapa.
Na lateral do sistema, informe:
o nome do ponto;
o tipo do ponto, como terminal ou ponto operacional.
Clique em Aplicar para salvar.

Depois de criado, o ponto passa a aparecer no sistema e pode ser utilizado como destino nas rotas.

Exemplo:

Se o gestor criar um ponto chamado Sede Administrativa, o usuário poderá enviar no WhatsApp:

Quero ir para a Sede Administrativa

O sistema poderá então gerar uma rota para esse novo local.

Remoção de pontos criados

Os pontos criados pelo gestor podem ser removidos pelo painel lateral direito do dashboard.

Na lateral, o gestor consegue visualizar os pontos cadastrados e remover aqueles que não devem mais permanecer no sistema.

Monitoramento em tempo real

O dashboard do gestor mostra a localização dos usuários que aceitaram compartilhar a posição.

Importante:

apenas usuários que autorizaram a localização aparecem no mapa;
o sistema não rastreia usuários sem consentimento;
a localização é usada para navegação operacional e demonstração do MVP;
o gestor consegue acompanhar os usuários ativos diretamente pelo mapa.
Fluxo principal do MVP

O fluxo principal de teste funciona assim:

O usuário envia uma mensagem no WhatsApp pedindo uma rota.
O Marco interpreta o destino solicitado.
O sistema envia um link de navegação.
O usuário abre o link.
O usuário autoriza o uso da localização.
O mapa acompanha a posição em tempo real.
O gestor visualiza os usuários ativos no dashboard.
O gestor pode criar bloqueios ou novos pontos operacionais.
O sistema atualiza o comportamento das rotas conforme os pontos e bloqueios criados.
Exemplo de teste completo
Envie no WhatsApp:
Quero ir para o Pier 4
Abra o link recebido.
Autorize o uso da localização.
Acesse o painel do gestor:
https://conecta-vale.vercel.app/gestor
Faça login com:
Email: gestor@conecta-vale.local
Senha: Gestor@123
No painel do gestor, clique em Adicionar bloqueio.
Clique em um ponto do mapa.
Informe o nome e o tamanho do bloqueio.
Clique em Aplicar.
Solicite novamente uma rota pelo WhatsApp e observe o comportamento do sistema.
Objetivo do projeto

O Connecta Vale foi desenvolvido como um MVP para demonstrar uma solução de mobilidade operacional com:

solicitação de rotas pelo WhatsApp;
interpretação inteligente de destinos;
mapa interativo;
compartilhamento de localização em tempo real;
painel administrativo para gestores;
criação de pontos operacionais;
simulação de bloqueios;
adaptação dinâmica das rotas.

O objetivo é mostrar como uma operação pode receber solicitações, gerar rotas, acompanhar usuários e ajustar o mapa operacional de forma dinâmica.

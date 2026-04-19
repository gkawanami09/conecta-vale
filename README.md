# Connecta Vale

**Navegação operacional em tempo real com WhatsApp, mapa ao vivo e painel de gestão.**

O Connecta Vale é um MVP criado para simular uma central de mobilidade operacional.  
Com ele, o usuário pede uma rota pelo WhatsApp, recebe um link de navegação, autoriza a localização e passa a ser acompanhado em tempo real no mapa. O gestor, por sua vez, consegue visualizar usuários ativos, adicionar pontos operacionais e criar bloqueios no mapa.

---

## Teste rápido

### 1. Peça uma rota pelo WhatsApp

Envie uma mensagem para:

**+55 11 5194-5106**

Exemplos de mensagens:

```text
Quero ir para o Pier 4
Quero ir para a subestação
Me manda a rota para a entrada vale
Como chego no ponto de ônibus?
Pontos disponíveis para teste
Pier 4
Subestação
Entrada Vale
Ponto de ônibus

Depois de enviar a mensagem, o sistema responderá com um link de navegação.

Importante: autorize a localização

Ao abrir o link recebido pelo WhatsApp, clique em permitir localização.

O sistema precisa dessa permissão para:

mostrar sua posição no mapa;
acompanhar sua movimentação em tempo real;
permitir que o gestor visualize usuários ativos no dashboard.

O Connecta Vale segue as normas da LGPD: a localização só é usada quando o usuário autoriza o compartilhamento.

Atenção para usuários de iPhone

Em alguns iPhones, principalmente no Google Chrome, o navegador pode bloquear automaticamente a localização.

Caso a localização não funcione:

teste pelo Safari;
verifique se o navegador tem permissão de localização ativa;
abra novamente o link da rota depois de liberar a permissão.
Acesso do gestor

O dashboard administrativo pode ser acessado em:

https://conecta-vale.vercel.app/gestor

Credenciais:

Email: gestor@conecta-vale.local
Senha: Gestor@123
O que o gestor consegue fazer

No dashboard, o gestor pode:

ver no mapa os usuários que aceitaram compartilhar localização;
acompanhar usuários em tempo real;
visualizar pontos fixos operacionais;
adicionar novos pontos no mapa;
criar bloqueios operacionais;
remover pontos criados;
simular mudanças na operação.
Como criar um bloqueio no mapa

No painel do gestor:

Clique em Adicionar bloqueio.
Clique no local desejado no mapa.
Na lateral direita, informe:
o nome do bloqueio;
o tamanho do bloqueio em metros.
Clique em Aplicar.

Para cancelar antes de salvar, clique em Cancelar.

Depois de aplicado, o bloqueio passa a ser considerado pelo sistema e pode impactar as rotas dos usuários.

Como adicionar um novo ponto operacional

No painel do gestor:

Clique em Adicionar ponto.
Clique no local desejado no mapa.
Na lateral direita, informe:
o nome do ponto;
o tipo do ponto: terminal ou ponto operacional.
Clique em Aplicar.

Depois de criado, esse ponto passa a aparecer no sistema e pode ser usado como destino.

Exemplo:

Se o gestor criar um ponto chamado Sede Administrativa, o usuário poderá mandar no WhatsApp:

Quero ir para a Sede Administrativa

E o sistema poderá gerar uma rota para esse novo local.

Como remover pontos criados

Na lateral direita do dashboard, o gestor consegue ver os pontos criados e remover aqueles que não devem mais ficar ativos no sistema.

Fluxo principal do sistema
O usuário manda uma mensagem no WhatsApp pedindo uma rota.
O Marco interpreta o destino solicitado.
O sistema envia um link de navegação.
O usuário abre o link.
O usuário autoriza o uso da localização.
O mapa acompanha a posição em tempo real.
O gestor vê o usuário ativo no dashboard.
O gestor pode criar bloqueios ou novos pontos.
O sistema atualiza o mapa e as rotas conforme as mudanças.
Sugestão de teste completo
Envie no WhatsApp:
Quero ir para o Pier 4
Abra o link recebido.
Autorize o uso da localização.
Acesse o painel do gestor:
https://conecta-vale.vercel.app/gestor
Faça login:
Email: gestor@conecta-vale.local
Senha: Gestor@123
No dashboard, clique em Adicionar bloqueio.
Clique em algum ponto do mapa.
Informe o nome e o tamanho do bloqueio.
Clique em Aplicar.
Peça uma nova rota pelo WhatsApp e observe o comportamento do sistema.
Funcionalidades principais
Solicitação de rotas pelo WhatsApp.
Interpretação inteligente de destinos.
Envio automático de link de navegação.
Mapa interativo.
Localização em tempo real com autorização do usuário.
Painel administrativo para gestores.
Visualização de usuários ativos no mapa.
Criação de pontos operacionais.
Simulação de bloqueios.
Atualização dinâmica da operação.
Objetivo do projeto

O Connecta Vale demonstra como uma operação pode usar WhatsApp, mapa em tempo real e painel de gestão para melhorar a mobilidade interna.

A proposta é facilitar o envio de rotas, o acompanhamento de usuários e a adaptação do mapa operacional conforme bloqueios, pontos fixos e necessidades da operação.

"""O assistente com IA (Claude) sobre os dados da própria empresa.

* ``tools``      — as ferramentas só de leitura que o modelo pode chamar, todas
                   presas à empresa autenticada;
* ``claude``     — o ciclo de conversa com a API da Anthropic;
* ``rate_limit`` — o tecto de pedidos por utilizador/empresa (custo).

Sem chave, com a IA desligada, ou em qualquer falha, o orquestrador
(app/services/ai_orchestrator.py) responde com o motor de palavras-chave.
"""

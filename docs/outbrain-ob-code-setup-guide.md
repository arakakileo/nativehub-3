# Guia OB Code - Nutraceuticos ($220 Revenue, $120 CPA Target)

> Regras otimizadas para maximizar volume mantendo CPA <= $120
> Baseado em: https://www.outbrain.com/help/advertisers/what-is-ob-code-and-how-to-use-it/

## Seu Cenario

| Metrica | Valor |
|---------|-------|
| Revenue/Purchase | $220 |
| Target CPA | $120 |
| Margem/Venda | $100 (45%) |
| Break-even CPA | $220 |
| Objetivo | Maximo volume em CPA <= $120 |

---

## Acesso ao OB Code

1. Acesse https://my.outbrain.com
2. Menu lateral → **Labs** → **OB Code**

---

## THRESHOLDS CALCULADOS

| Nivel | Multiplicador | Valor | Acao |
|-------|---------------|-------|------|
| Excelente | 0.5x | $60 | Bid +50% |
| Bom | 0.75x | $90 | Bid +25% |
| Target | 1.0x | $120 | Bid +10% |
| Ruim | 1.5x | $180 | Bid -10% |
| Critico | 2.0x | $240 | Bid -25% / Blacklist |
| Blacklist (no conv) | 3x | $360 | Bloquear |

---

## REGRAS DE BLACKLIST

### Regra 1: Blacklist - Sem Conversoes

**Bloquear sections que gastaram $360+ sem converter**

| Campo | Valor |
|-------|-------|
| Scope | Campaign Level |
| Lookback | Last 7 Days |
| Condition 1 | `Spend >= 360` |
| Condition 2 | `Conversions = 0` |
| Action | `Exclude Section` |

---

### Regra 2: Blacklist - CPA Critico

**Bloquear sections com CPA > 2x target ($240)**

| Campo | Valor |
|-------|-------|
| Scope | Campaign Level |
| Lookback | Last 7 Days |
| Condition 1 | `Spend >= 240` |
| Condition 2 | `Conversions >= 1` |
| Condition 3 | `CPA > 240` |
| Action | `Exclude Section` |

---

### Regra 3: Blacklist - CTR Fraudulento

**Detectar e bloquear trafego de bots**

| Campo | Valor |
|-------|-------|
| Scope | Campaign Level |
| Lookback | Last 7 Days |
| Condition 1 | `Impressions >= 1000` |
| Condition 2 | `CTR > 15` |
| Condition 3 | `Conversions = 0` |
| Action | `Exclude Section` |

---

## REGRAS DE BID INCREASE (Escalar Winners)

### Regra 4: Bid +50% - CPA Excelente

**Escalar agressivamente sections com CPA < $60**

| Campo | Valor |
|-------|-------|
| Scope | Campaign Level |
| Lookback | Last 7 Days |
| Condition 1 | `Spend >= 120` |
| Condition 2 | `Conversions >= 2` |
| Condition 3 | `CPA < 60` |
| Action | `Adjust Section Bid +50%` |

---

### Regra 5: Bid +25% - CPA Bom

**Escalar sections com CPA $60-90**

| Campo | Valor |
|-------|-------|
| Scope | Campaign Level |
| Lookback | Last 7 Days |
| Condition 1 | `Spend >= 120` |
| Condition 2 | `Conversions >= 2` |
| Condition 3 | `CPA >= 60` |
| Condition 4 | `CPA < 90` |
| Action | `Adjust Section Bid +25%` |

---

### Regra 6: Bid +10% - CPA No Target

**Manter e escalar levemente sections no target**

| Campo | Valor |
|-------|-------|
| Scope | Campaign Level |
| Lookback | Last 7 Days |
| Condition 1 | `Spend >= 120` |
| Condition 2 | `Conversions >= 2` |
| Condition 3 | `CPA >= 90` |
| Condition 4 | `CPA <= 120` |
| Action | `Adjust Section Bid +10%` |

---

## REGRAS DE BID DECREASE (Reduzir Perdedores)

### Regra 7: Bid -10% - CPA Acima do Target

**Reduzir bid em sections com CPA $120-180**

| Campo | Valor |
|-------|-------|
| Scope | Campaign Level |
| Lookback | Last 7 Days |
| Condition 1 | `Spend >= 120` |
| Condition 2 | `Conversions >= 1` |
| Condition 3 | `CPA > 120` |
| Condition 4 | `CPA <= 180` |
| Action | `Adjust Section Bid -10%` |

---

### Regra 8: Bid -25% - CPA Ruim

**Reduzir agressivamente sections com CPA $180-240**

| Campo | Valor |
|-------|-------|
| Scope | Campaign Level |
| Lookback | Last 7 Days |
| Condition 1 | `Spend >= 180` |
| Condition 2 | `Conversions >= 1` |
| Condition 3 | `CPA > 180` |
| Condition 4 | `CPA <= 240` |
| Action | `Adjust Section Bid -25%` |

---

## REGRAS DE AUTO-SCALE BUDGET

### Regra 9: Auto-Increase Daily Cap +$100

**Aumentar budget quando capped e performando bem**

| Campo | Valor |
|-------|-------|
| Scope | Campaign Level |
| Lookback | Today |
| Condition 1 | `Daily Cap Reached = True` |
| Condition 2 | `CPA <= 120` |
| Condition 3 | `Conversions >= 3` |
| Action | `Increase Daily Cap by $100` |

---

### Regra 10: Auto-Increase Daily Cap +$200 (Agressivo)

**Escalar rapido quando CPA excelente**

| Campo | Valor |
|-------|-------|
| Scope | Campaign Level |
| Lookback | Today |
| Condition 1 | `Daily Cap Reached = True` |
| Condition 2 | `CPA <= 90` |
| Condition 3 | `Conversions >= 5` |
| Action | `Increase Daily Cap by $200` |

---

## REGRAS DE PROTECAO

### Regra 11: Pausar Campanha Sangrando

**Parar campanha que gastou $500+ sem conversao**

| Campo | Valor |
|-------|-------|
| Scope | Account Level |
| Lookback | Today |
| Condition 1 | `Spend >= 500` |
| Condition 2 | `Conversions = 0` |
| Action | `Pause Campaign` |
| Notification | Email imediato |

---

### Regra 12: Alerta - Escalar Campanha

**Notificar quando campanha esta pronta para escalar**

| Campo | Valor |
|-------|-------|
| Scope | Account Level |
| Lookback | Today |
| Condition 1 | `Spend >= 500` |
| Condition 2 | `Conversions >= 5` |
| Condition 3 | `CPA <= 90` |
| Action | `Send Email Alert` |
| Message | "ESCALAR: Campanha com CPA excelente!" |

---

## ORDEM DE PRIORIDADE

Configure as regras nesta ordem no OB Code:

| Prioridade | Regra | Descricao |
|------------|-------|-----------|
| 1 | Blacklist Fraud | CTR > 15% (bots) |
| 2 | Pause Bleeding | $500+ sem conv |
| 3 | Blacklist No Conv | $360+ sem conv |
| 4 | Blacklist High CPA | CPA > $240 |
| 5 | Bid -25% | CPA $180-240 |
| 6 | Bid -10% | CPA $120-180 |
| 7 | Bid +50% | CPA < $60 |
| 8 | Bid +25% | CPA $60-90 |
| 9 | Bid +10% | CPA $90-120 |
| 10 | Auto-Scale +$200 | Capped + CPA <= $90 |
| 11 | Auto-Scale +$100 | Capped + CPA <= $120 |
| 12 | Scale Alert | Notificacao |

---

## RESUMO VISUAL

```
CPA $0 -------- $60 -------- $90 -------- $120 -------- $180 -------- $240 -------- $360+
       |         |           |            |             |             |            |
       | +50%    | +25%      | +10%       | -10%        | -25%        | BLACKLIST  | BLACKLIST
       | bid     | bid       | bid        | bid         | bid         | (com conv) | (sem conv)
       |         |           |            |             |             |            |
       EXCELENTE   BOM        TARGET       RUIM          CRITICO       PERDA       SANGRAR
```

---

## CONFIGURACOES RECOMENDADAS

| Setting | Valor | Razao |
|---------|-------|-------|
| Lookback | 7 dias | Nutra tem janela conversao maior |
| Min Spend | $120 | 1x CPA para dados relevantes |
| Min Conversions | 2 | Evitar decisoes em 1 conv |
| Bid Cap Max | +100% | Evitar bids absurdos |
| Daily Cap Increase | $100-200 | Escala gradual |
| Execution | Hourly | Padrao OB Code |

---

## DICAS PARA NUTRA

1. **Janela de Conversao:** Nutra pode ter 24-48h delay - use lookback 7 dias
2. **Sazonalidade:** Performance varia por dia da semana - monitore
3. **Creative Fatigue:** Rotacione criativos a cada 2-3 semanas
4. **Compliance:** Outbrain e rigoroso com claims de saude
5. **Escala Gradual:** Aumente budget max 20-30%/dia

---

## CHECKLIST DE IMPLEMENTACAO

- [ ] Criar Regra 1: Blacklist Sem Conversoes ($360)
- [ ] Criar Regra 2: Blacklist CPA Critico ($240)
- [ ] Criar Regra 3: Blacklist CTR Fraud (>15%)
- [ ] Criar Regra 4: Bid +50% (CPA < $60)
- [ ] Criar Regra 5: Bid +25% (CPA $60-90)
- [ ] Criar Regra 6: Bid +10% (CPA $90-120)
- [ ] Criar Regra 7: Bid -10% (CPA $120-180)
- [ ] Criar Regra 8: Bid -25% (CPA $180-240)
- [ ] Criar Regra 9: Auto-Scale +$100
- [ ] Criar Regra 10: Auto-Scale +$200
- [ ] Criar Regra 11: Pause Bleeding
- [ ] Criar Regra 12: Scale Alert
- [ ] Configurar email para alertas
- [ ] Testar em 1 campanha por 7 dias
- [ ] Aplicar em todas campanhas

---

## LINKS UTEIS

- [OB Code Reference Guide (PDF)](https://www.outbrain.com/help/wp-content/uploads/2020/10/Amplify-OB-Code-Reference-Guide-Aug.-2020.pdf)
- [OB Code Help](https://www.outbrain.com/help/advertisers/what-is-ob-code-and-how-to-use-it/)
- [Amplify API](https://developer.outbrain.com/home-page/amplify-api/)

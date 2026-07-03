# CLAUDE.md

Cronograma de estudos do Edney para a Formação Completa Simplifica Treinamentos (Excel 80h + Power BI 80h + IA 36h, Hotmart). App de página única que roda como widget no PC (Edge modo app) e PWA no Android.

## Arquitetura

- `cronograma.html` — app completo (UI + lógica). Estrutura de dados v4: `{v:4, cursos:[{id, nome, cor, meta, modulos:[{nome, aulas:[{nome, feito, data}]}]}]}`. Módulo com `aulas:[]` é clicável inteiro (campo `feito` no módulo).
- `dados-cursos.js` — `const PADRAO` com a grade completa (Excel: 536 aulas em 19 seções, extraída da página pública de vendas da Hotmart via componentes `hot-collapse`; Power BI/IA só por módulo — as páginas deles não expõem a grade).
- `simplifica-sync.user.js` — userscript Tampermonkey que roda na sessão logada do Edney na Hotmart e marca aulas concluídas direto no Supabase (aditivo, nunca desmarca; módulo "Completo" → todas as aulas; aula aberta → as anteriores do módulo).
- `sw.js` + `manifest.webmanifest` + `icon-*.png` — PWA (cache network-first; nunca cacheia chamadas ao Supabase).

## Persistência

Nuvem = fonte da verdade: tabela `cronograma_estudo` (linha única id=1, jsonb) no Supabase `splkpfmpnpclxxuktggl` (compartilhado com os outros apps do Edney), acesso anon aberto — dado de baixo risco. `localStorage` (chave `cronograma-simplifica-v4`) é só cache/fallback offline. Ao carregar: se a nuvem tiver `v` diferente, `mesclar()` reaplica os `feito` por nome sobre o seed novo e sobe. Para atualizar a grade sem perder progresso: editar `dados-cursos.js` e subir `VERSAO`/`v` — a mesclagem preserva os checks.

## Deploy

GitHub Pages (repo público `edneycarvalho6-ctrl/cronograma-simplifica`): push na main publica em https://edneycarvalho6-ctrl.github.io/cronograma-simplifica/ — builds às vezes travam em "building"; retrigar com `gh api -X POST repos/edneycarvalho6-ctrl/cronograma-simplifica/pages/builds`. Atalho do Desktop "Cronograma Simplifica" abre a URL hospedada em Edge `--app` (janela 410×660).

## Regras

- NUNCA armazenar senhas do Edney (regra dele). A anon key do Supabase é pública por design — pode ficar no código.
- Login automatizado na Hotmart é bloqueado por captcha — não tentar; sincronização é pelo userscript ou por print que o Edney manda.
- Plano de estudo: 1h/dia útil, sem fins de semana/feriados, férias em dez/2026; ordem Excel → Power BI → IA; conclusão prevista abr-mai/2027.

# Envio de placares no modo de teste

O parâmetro `testePlacar=1` permite editar a cópia local do campeonato sem login. Para enviar esses resultados à API Interclasse, a função `interclasse-proxy` exige um código temporário e aceita somente um campeonato configurado.

1. Gere um código aleatório com pelo menos 16 caracteres e calcule seu SHA-256. Por exemplo:

   ```sh
   codigo=$(openssl rand -hex 24)
   printf '%s\n' "$codigo"
   printf '%s' "$codigo" | sha256sum
   ```

2. Nos segredos da função no Supabase, defina `TEST_CHAMPIONSHIP_ID` com o `id` da URL do campeonato e `TEST_SCORE_CODE_HASH` com o hash de 64 caracteres gerado acima. `APP_ORIGIN` deve ser `https://valada0.github.io`, sem barra final. O código em si não vai para os segredos nem para o repositório.
3. Publique a versão atualizada da função `interclasse-proxy` e do site. Abra `campeonato.html?id=ID&testePlacar=1`. Ao salvar o primeiro placar, informe o código gerado.
4. Verifique a confirmação de envio na seção da API. A cópia do campeonato permanece nesta aba; a API Interclasse recebe o placar real.
5. Depois dos testes, remova `TEST_CHAMPIONSHIP_ID` e `TEST_SCORE_CODE_HASH` dos segredos e abra o campeonato sem `testePlacar=1` para voltar ao fluxo com login do organizador.

O envio de teste aceita partidas já publicadas no campeonato configurado. Uma criação remota sem confirmação fica reservada para evitar duplicação e precisa ser conferida na API antes de tentar novamente.

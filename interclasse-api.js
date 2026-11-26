(() => {
  const FUNCTION_NAME = "interclasse-proxy";

  function statusDaFalha(error) {
    return error && error.context && Number.isInteger(error.context.status)
      ? error.context.status
      : undefined;
  }

  async function falhaDaFuncao(error) {
    const status = statusDaFalha(error);
    let detalhe = "";
    if (error && error.context && typeof error.context.clone === "function") {
      try {
        const body = await error.context.clone().json();
        detalhe = body && (body.error || body.erro || body.message)
          ? body.error || body.erro || body.message
          : "";
      } catch {
        detalhe = "";
      }
    }
    const mensagens = {
      400: "A função rejeitou os dados enviados.",
      401: "Sessão Supabase inválida ou expirada. Entre novamente.",
      403: "A origem não está autorizada ou esta conta não é dona do campeonato/placar.",
      404: "Campeonato, partida ou placar não encontrado.",
      409: "A partida já tem uma tentativa reservada ou precisa de verificação.",
      503: "Falha temporária ao acessar a API. Verifique a rede e tente novamente."
    };
    const mensagem = status
      ? mensagens[status] || `A função respondeu com HTTP ${status}.`
      : "Falha de rede ou CORS ao acessar a função segura do Interclasse.";
    const falha = new Error(detalhe || mensagem);
    falha.status = status;
    throw falha;
  }

  async function invocar(acao, dados) {
    const cliente = window.arenaStore.client;
    const { data, error } = await cliente.functions.invoke(FUNCTION_NAME, {
      body: { acao, ...dados }
    });
    if (error) {
      await falhaDaFuncao(error);
    }
    if (!data || typeof data !== "object") {
      throw new Error("A função do Interclasse respondeu sem os dados esperados.");
    }
    return data;
  }

  window.interclasseApi = {
    check(championshipId) {
      return invocar("check", { championshipId });
    },
    create(championshipId, gameId, confirmarAusencia = false) {
      return invocar("create", { championshipId, gameId, confirmarAusencia });
    },
    get(championshipId, gameId, scoreId) {
      return invocar("get", { championshipId, gameId, scoreId });
    },
    peek(championshipId, gameId, scoreId) {
      return invocar("peek", { championshipId, gameId, scoreId });
    },
    listCandidates(championshipId, gameId) {
      return invocar("listCandidates", { championshipId, gameId });
    },
    associate(championshipId, gameId, scoreId) {
      return invocar("associate", { championshipId, gameId, scoreId });
    },
    patch(championshipId, gameId, scoreId, fields) {
      return invocar("patch", { championshipId, gameId, scoreId, fields });
    }
  };
})();

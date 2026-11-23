(() => {
  const API_BASE_URL = "https://rvarjao.pythonanywhere.com/api";
  let token = "e_ztb5x_ES6zRIdk1eUBg35QBTatR0pJqKZJeR6s8dY";

  class ApiError extends Error {
    constructor(status, message) {
      super(message);
      this.name = "InterclasseApiError";
      this.status = status;
    }
  }

  function mensagemHttp(status, detalhe) {
    const mensagens = {
      400: "A API rejeitou os dados. Confira equipes, modalidade e pontuação.",
      401: "Token inválido ou ausente. Confira o token com o professor.",
      403: "A origem não está autorizada ou este placar pertence a outro grupo.",
      404: "Placar não encontrado. Confira o ID salvo.",
      503: "A API está temporariamente indisponível. Tente novamente mais tarde."
    };
    return (mensagens[status] || `A API respondeu com HTTP ${status}.`) +
      (detalhe ? ` ${detalhe}` : "");
  }

  async function requisitar(caminho, metodo = "GET", corpo) {
    if (!token) throw new Error("Informe o token individual do grupo.");
    const headers = { Authorization: `Bearer ${token}` };
    const opcoes = { method: metodo, headers, credentials: "omit" };
    if (corpo !== undefined) {
      headers["Content-Type"] = "application/json";
      opcoes.body = JSON.stringify(corpo);
    }

    let resposta;
    try {
      resposta = await fetch(`${API_BASE_URL}${caminho}`, opcoes);
    } catch (error) {
      const falha = new Error("Falha de rede ou CORS. Confira a conexão e se a origem foi autorizada pelo professor.");
      falha.causa = error;
      throw falha;
    }

    const texto = await resposta.text();
    let dados = null;
    if (texto) {
      try {
        dados = JSON.parse(texto);
      } catch {
        dados = null;
      }
    }
    if (!resposta.ok) {
      const detalhe = dados && (dados.message || dados.erro || dados.error);
      throw new ApiError(resposta.status, mensagemHttp(resposta.status, detalhe));
    }
    if (!dados || typeof dados !== "object") {
      throw new Error("A API respondeu sem os dados esperados.");
    }
    return dados;
  }

  function idSeguro(id) {
    const valor = String(id);
    if (!/^[a-zA-Z0-9_-]+$/.test(valor)) throw new Error("ID de placar inválido.");
    return encodeURIComponent(valor);
  }

  window.interclasseApi = {
    setToken(valor) {
      token = String(valor || "").trim();
      return Boolean(token);
    },
    clearToken() {
      token = "";
    },
    hasToken() {
      return Boolean(token);
    },
    create(payload) {
      return requisitar("/placares/criar", "POST", payload);
    },
    get(id) {
      return requisitar(`/placares/${idSeguro(id)}`);
    },
    list() {
      return requisitar("/placares");
    },
    patch(id, campos) {
      return requisitar(`/placares/${idSeguro(id)}`, "PATCH", campos);
    }
  };

  window.addEventListener("pagehide", () => { token = ""; });
})();

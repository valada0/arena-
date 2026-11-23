const parametros = new URLSearchParams(window.location.search);
const idCampeonato = parametros.get("id");
let campeonatos = [];
let campeonato = null;
let abaAtual = "jogos";
let jogoModalAtual = null;
let inscricoes = [];
let tokenCarregamentoInscricoes = 0;
const filasSincronizacaoInterclasse = new Map();
const estadoApiInterclasse = new Map();
let ultimaSincronizacaoInterclasse = null;

function carregarDados() {
  return window.arenaStore.championships;
}
function ehOrganizador() {
  return Boolean(campeonato && window.arenaStore.user &&
    campeonato.ownerId === window.arenaStore.user.id);
}
function exigirOrganizador() {
  if (ehOrganizador()) return true;
  if (!window.arenaStore.user) window.arenaStore.openAuth();
  return false;
}
function salvarDados() {
  if (!campeonato || !exigirOrganizador()) return Promise.resolve(false);
  return window.arenaStore.save(campeonato).then(() => true).catch((error) => {
    window.arenaStore.showError(error);
    return false;
  });
}
function atualizarStatusInterclasse(mensagem, estado = "") {
  const status = document.getElementById("statusInterclasse");
  if (!status) return;
  status.textContent = mensagem;
  status.dataset.estado = estado;
  const ultima = document.getElementById("ultimaSincronizacaoInterclasse");
  if (ultima && ultimaSincronizacaoInterclasse) {
    ultima.textContent = "Última sincronização confirmada: " +
      ultimaSincronizacaoInterclasse.toLocaleString("pt-BR");
  }
}
function mensagemErroInterclasse(error) {
  return error && error.message ? error.message : "Não foi possível sincronizar com a API.";
}
function modalidadeInterclasse(modalidade) {
  const valor = String(modalidade || "").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const equivalencias = {
    "volei de praia": "volei",
    "volei": "volei",
    "futevolei": "futevolei",
    "futebol": "futebol",
    "futsal": "futsal",
    "basquete": "basquete",
    "tenis": "tenis",
    "teqball": "teqball"
  };
  return equivalencias[valor] || valor.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}
function estadoInterclasseDesejado(jogo) {
  if (jogoConcluido(jogo)) return "encerrado";
  if (jogo.statusQuadra === "em-andamento") return "em_andamento";
  return "aguardando";
}
function jogoElegivelParaInterclasse(jogo) {
  return !jogo.folga && (jogo.statusQuadra === "em-andamento" || jogoConcluido(jogo));
}
function dadosApiInterclasse(jogo) {
  return {
    nome_equipe_a: String(jogo.equipeA || "").trim(),
    nome_equipe_b: String(jogo.equipeB || "").trim(),
    modalidade: modalidadeInterclasse(campeonato.modalidade)
  };
}
function lerEstadoApiInterclasse(jogo, dados) {
  const atual = estadoApiInterclasse.get(String(jogo.id)) || {};
  ["pontos_a", "pontos_b", "status", "tempo_partida"].forEach((campo) => {
    if (dados && Object.prototype.hasOwnProperty.call(dados, campo)) atual[campo] = dados[campo];
  });
  estadoApiInterclasse.set(String(jogo.id), atual);
  return atual;
}
function camposPendentesInterclasse(jogo) {
  const remoto = estadoApiInterclasse.get(String(jogo.id)) || {};
  const campos = {};
  const pontosA = jogo.placarA === null || jogo.placarA === "" ? 0 : Number(jogo.placarA);
  const pontosB = jogo.placarB === null || jogo.placarB === "" ? 0 : Number(jogo.placarB);
  if (Number.isInteger(pontosA) && pontosA >= 0 && Number(remoto.pontos_a) !== pontosA) {
    campos.pontos_a = pontosA;
  }
  if (Number.isInteger(pontosB) && pontosB >= 0 && Number(remoto.pontos_b) !== pontosB) {
    campos.pontos_b = pontosB;
  }
  const status = estadoInterclasseDesejado(jogo);
  if (remoto.status !== status) campos.status = status;
  return campos;
}
function erroCriacaoAmbigua(error) {
  return !Number.isInteger(error && error.status) || error.status >= 500 || error.status === 409;
}
async function criarPlacarInterclasse(jogo) {
  if (jogo.interclasseId || jogo.interclasseCriacaoPendente) return;
  const payload = dadosApiInterclasse(jogo);
  if (!payload.nome_equipe_a || !payload.nome_equipe_b || !payload.modalidade) {
    throw new Error("Informe as duas equipes e uma modalidade válida antes de sincronizar.");
  }
  jogo.interclasseCriacaoPendente = true;
  jogo.interclasseCriacaoAmbigua = false;
  if (!await salvarDados()) {
    jogo.interclasseCriacaoPendente = false;
    throw new Error("Não foi possível salvar a tentativa localmente; a API não foi chamada.");
  }
  let criado;
  try {
    criado = await window.interclasseApi.create(
      String(campeonato.id),
      String(jogo.id),
      jogo.interclasseRetryConfirmada === true
    );
  } catch (error) {
    jogo.interclasseCriacaoAmbigua = erroCriacaoAmbigua(error);
    if (!jogo.interclasseCriacaoAmbigua) jogo.interclasseCriacaoPendente = false;
    delete jogo.interclasseRetryConfirmada;
    await salvarDados();
    throw error;
  }
  if (criado.id === undefined || criado.id === null || String(criado.id) === "") {
    jogo.interclasseCriacaoAmbigua = true;
    await salvarDados();
    throw new Error("A API não confirmou um ID. Verifique o resultado antes de tentar novamente.");
  }
  jogo.interclasseId = String(criado.id);
  jogo.interclasseCriacaoPendente = false;
  jogo.interclasseCriacaoAmbigua = false;
  delete jogo.interclasseRetryConfirmada;
  lerEstadoApiInterclasse(jogo, criado);
  if (!await salvarDados()) {
    jogo.interclasseCriacaoPendente = true;
    jogo.interclasseCriacaoAmbigua = true;
    throw new Error("A API criou o placar, mas não foi possível salvar o ID localmente. Não crie outro; confira a API.");
  }
}
async function sincronizarJogoInterclasseAgora(jogo) {
  if (!jogo.interclasseId && !jogoElegivelParaInterclasse(jogo)) return;
  if (jogo.interclasseCriacaoPendente && !jogo.interclasseId) {
    atualizarStatusInterclasse(
      "Há uma criação sem confirmação. Verifique o resultado na API/monitor antes de solicitar nova tentativa.",
      "erro"
    );
    return;
  }
  if (jogo.interclasseId && jogo.interclasseCriacaoPendente) {
    jogo.interclasseCriacaoPendente = false;
    jogo.interclasseCriacaoAmbigua = false;
    if (!await salvarDados()) {
      jogo.interclasseCriacaoPendente = true;
      jogo.interclasseCriacaoAmbigua = true;
      throw new Error("Não foi possível salvar o ID já criado; nenhuma nova criação será feita.");
    }
  }
  if (!jogo.interclasseId) await criarPlacarInterclasse(jogo);
  let remoto = estadoApiInterclasse.get(String(jogo.id));
  if (!remoto) {
    remoto = lerEstadoApiInterclasse(jogo, await window.interclasseApi.get(
      String(campeonato.id), String(jogo.id), jogo.interclasseId
    ));
  }
  const campos = camposPendentesInterclasse(jogo);
  if (Object.keys(campos).length) {
    const resposta = await window.interclasseApi.patch(
      String(campeonato.id), String(jogo.id), jogo.interclasseId, campos
    );
    lerEstadoApiInterclasse(jogo, { ...remoto, ...campos, ...resposta });
  }
  ultimaSincronizacaoInterclasse = new Date();
  atualizarStatusInterclasse("API conectada; partida sincronizada.", "ok");
}
function sincronizarJogoInterclasse(jogo) {
  if (!jogo) return Promise.resolve();
  const chave = String(jogo.id);
  const anterior = filasSincronizacaoInterclasse.get(chave) || Promise.resolve();
  const atual = anterior.catch(() => {}).then(() => sincronizarJogoInterclasseAgora(jogo))
    .catch((error) => atualizarStatusInterclasse(mensagemErroInterclasse(error), "erro"));
  filasSincronizacaoInterclasse.set(chave, atual);
  void atual.then(() => {
    if (filasSincronizacaoInterclasse.get(chave) === atual) filasSincronizacaoInterclasse.delete(chave);
  });
  return atual;
}
function listaPlacaresInterclasse(resposta) {
  if (Array.isArray(resposta)) return resposta;
  if (resposta && Array.isArray(resposta.placares)) return resposta.placares;
  return null;
}
async function sincronizarJogosInterclasse() {
  if (!campeonato || !exigirOrganizador()) return;
  const botao = document.getElementById("sincronizarInterclasse");
  botao.disabled = true;
  try {
    const tentativasEmAndamento = todosJogosCampeonato()
      .filter((jogo) => jogo.interclasseCriacaoPendente && !jogo.interclasseId)
      .map((jogo) => filasSincronizacaoInterclasse.get(String(jogo.id)))
      .filter(Boolean);
    if (tentativasEmAndamento.length) await Promise.all(tentativasEmAndamento);
    const pendentes = todosJogosCampeonato().filter((jogo) =>
      jogo.interclasseCriacaoPendente && !jogo.interclasseId
    );
    if (pendentes.length) {
      atualizarStatusInterclasse("Verificando criações pendentes na listagem da API...");
      for (const jogo of pendentes) {
        const payload = dadosApiInterclasse(jogo);
        const placares = listaPlacaresInterclasse(await window.interclasseApi.listCandidates(
          String(campeonato.id), String(jogo.id)
        ));
        if (!placares) throw new Error("A API não retornou uma lista reconhecida.");
        const candidatos = placares.filter((placar) =>
          placar && String(placar.nome_equipe_a || "").trim() === payload.nome_equipe_a &&
          String(placar.nome_equipe_b || "").trim() === payload.nome_equipe_b &&
          String(placar.modalidade || "").trim() === payload.modalidade &&
          placar.id !== undefined && placar.id !== null
        );
        if (candidatos.length === 1) {
          const candidato = candidatos[0];
          const grupo = candidato.grupo_id === undefined ? "não informado" : candidato.grupo_id;
          if (!confirm(
            `A lista contém um placar compatível: ID ${candidato.id}, grupo ${grupo}. ` +
            "A lista é compartilhada. Só associe se confirmou que este ID pertence ao seu grupo. Associar?"
          )) continue;
          const associado = await window.interclasseApi.associate(
            String(campeonato.id), String(jogo.id), candidato.id
          );
          jogo.interclasseId = String(candidato.id);
          jogo.interclasseCriacaoPendente = false;
          jogo.interclasseCriacaoAmbigua = false;
          delete jogo.interclasseRetryConfirmada;
          lerEstadoApiInterclasse(jogo, associado);
          if (!await salvarDados()) {
            jogo.interclasseCriacaoPendente = true;
            jogo.interclasseCriacaoAmbigua = true;
            throw new Error("Não foi possível salvar o ID confirmado. A tentativa permanece protegida contra duplicação.");
          }
        } else if (candidatos.length > 1) {
          atualizarStatusInterclasse(
            `Há ${candidatos.length} placares compatíveis na lista compartilhada. Confirme o ID e o grupo no monitor antes de agir.`,
            "erro"
          );
          return;
        } else {
          const conferir = confirm(
            `A listagem não encontrou "${payload.nome_equipe_a} × ${payload.nome_equipe_b}". ` +
            "Confira também o monitor e confirme que não há criação em processamento antes de tentar novamente. Continuar?"
          );
          if (!conferir) continue;
          jogo.interclasseCriacaoPendente = false;
          jogo.interclasseCriacaoAmbigua = false;
          jogo.interclasseRetryConfirmada = true;
          if (!await salvarDados()) {
            jogo.interclasseCriacaoPendente = true;
            jogo.interclasseCriacaoAmbigua = true;
            throw new Error("Não foi possível registrar a decisão localmente; nenhuma repetição foi feita.");
          }
        }
      }
    }
    sincronizarElegiveisInterclasse();
  } catch (error) {
    atualizarStatusInterclasse(mensagemErroInterclasse(error), "erro");
  } finally {
    botao.disabled = false;
  }
}
function sincronizarElegiveisInterclasse() {
  const jogos = todosJogosCampeonato().filter((jogo) =>
    jogoElegivelParaInterclasse(jogo) || jogo.interclasseId
  );
  if (!jogos.length) {
    atualizarStatusInterclasse("Não há partidas iniciadas ou com resultado para sincronizar.");
    return;
  }
  atualizarStatusInterclasse("Sincronizando partidas...");
  void Promise.all(jogos.map(sincronizarJogoInterclasse));
}
async function conectarInterclasse() {
  atualizarStatusInterclasse("Validando token e origem...");
  try {
    await window.interclasseApi.check(String(campeonato.id));
    atualizarStatusInterclasse("Conexão confirmada. Partidas locais permanecem salvas.", "ok");
  } catch (error) {
    atualizarStatusInterclasse(mensagemErroInterclasse(error), "erro");
  }
}
async function recuperarPlacarInterclasse() {
  if (!jogoModalAtual || !jogoModalAtual.interclasseId || !exigirOrganizador()) return;
  const status = document.getElementById("statusApiJogo");
  const botao = document.getElementById("recuperarPlacarApi");
  botao.disabled = true;
  status.textContent = "Consultando o mesmo ID na API...";
  try {
    const dados = await window.interclasseApi.get(
      String(campeonato.id), String(jogoModalAtual.id), jogoModalAtual.interclasseId
    );
    if (!Number.isInteger(dados.pontos_a) || dados.pontos_a < 0 ||
        !Number.isInteger(dados.pontos_b) || dados.pontos_b < 0 ||
        !["aguardando", "em_andamento", "encerrado"].includes(dados.status)) {
      throw new Error("A API retornou um estado de placar inválido.");
    }
    lerEstadoApiInterclasse(jogoModalAtual, dados);
    if (dados.status === "encerrado") {
      jogoModalAtual.placarA = dados.pontos_a;
      jogoModalAtual.placarB = dados.pontos_b;
      atualizarFasesConcluidas();
      avancarFasesAutomaticamente();
      if (!await salvarDados()) throw new Error("O estado foi consultado, mas não foi possível salvá-lo no campeonato.");
    } else if (dados.status === "aguardando") {
      jogoModalAtual.placarA = null;
      jogoModalAtual.placarB = null;
      if (!await salvarDados()) throw new Error("O estado foi consultado, mas não foi possível salvá-lo no campeonato.");
    }
    document.getElementById("placarAModal").value =
      dados.status === "encerrado" ? dados.pontos_a : "";
    document.getElementById("placarBModal").value =
      dados.status === "encerrado" ? dados.pontos_b : "";
    status.textContent = `API: ${dados.status}, ${dados.pontos_a} × ${dados.pontos_b}.` +
      (dados.status === "em_andamento"
        ? " O placar local não tem modo de edição ao vivo; os pontos foram apenas consultados."
        : " O estado foi recuperado localmente.");
    ultimaSincronizacaoInterclasse = new Date();
    atualizarStatusInterclasse("Consulta da partida confirmada.", "ok");
    renderizar();
  } catch (error) {
    status.textContent = mensagemErroInterclasse(error);
    atualizarStatusInterclasse(mensagemErroInterclasse(error), "erro");
  } finally {
    botao.disabled = false;
  }
}
function desfazerCampeonato() {
  if (!campeonato || !exigirOrganizador()) return;
  const confirmar = confirm("Deseja desfazer o andamento deste campeonato? Todos os placares e fases geradas serão removidos.");
  if (!confirmar) return;
  campeonato.fases = [];
  prepararCampeonato();
  atualizarFasesConcluidas();
  void salvarDados().then((salvo) => {
    if (salvo) sincronizarElegiveisInterclasse();
  });
  abaAtual = "jogos";
  renderizar();
}
function abrirEdicaoCampeonato() {
  if (!campeonato || !exigirOrganizador()) return;
  document.getElementById("nomeCampeonatoEdicao").value = campeonato.nome;
  document.getElementById("modalidadeCampeonatoEdicao").value = campeonato.modalidade;
  document.getElementById("quadrasCampeonatoEdicao").value = obterQuantidadeQuadras();
  document.getElementById("modalCampeonato").showModal();
}
function salvarEdicaoCampeonato(evento) {
  evento.preventDefault();
  if (!exigirOrganizador()) return;
  const nome = document.getElementById("nomeCampeonatoEdicao").value.trim();
  const modalidade = document.getElementById("modalidadeCampeonatoEdicao").value.trim();
  const quadras = Number(document.getElementById("quadrasCampeonatoEdicao").value);
  if (!nome || !modalidade || !Number.isInteger(quadras) || quadras < 1 || quadras > 100) {
    alert("Informe nome, modalidade e uma quantidade válida de quadras (de 1 a 100).");
    return;
  }
  const jogosComQuadraRemovida = todosJogosCampeonato()
    .filter((jogo) => Number.isInteger(jogo.quadra) && jogo.quadra > quadras);
  if (jogosComQuadraRemovida.length &&
      !confirm("Reduzir a quantidade de quadras removerá a quadra atribuída a alguns jogos. Os placares serão mantidos. Deseja continuar?")) return;

  campeonato.nome = nome;
  campeonato.modalidade = modalidade;
  campeonato.quadras = quadras;
  jogosComQuadraRemovida.forEach((jogo) => {
    delete jogo.quadra;
    delete jogo.statusQuadra;
  });
  salvarDados();
  document.getElementById("modalCampeonato").close();
  renderizar();
}
function atualizarInscricoesNaTela() {
  const conteudo = document.getElementById("conteudoInscricoes");
  if (!campeonato) {
    conteudo.replaceChildren();
    return;
  }
  const user = window.arenaStore.user;
  const inscricaoDoUsuario = user && inscricoes.find((item) => item.user_id === user.id);
  const ehCriador = ehOrganizador();
  const podeInscrever = campeonato.inscricoesAbertas;
  let formulario = "";
  if (podeInscrever && (!inscricaoDoUsuario || ehCriador)) {
    formulario = user
      ? `<form class="form-inscricao" id="formInscricao">
          <label for="nomeEquipeInscricao">Nome da equipe
            <input id="nomeEquipeInscricao" required minlength="1" maxlength="60">
          </label>
          <button class="botao" type="submit">Inscrever equipe</button>
          ${ehCriador ? '<p class="ajuda-inscricao">Como criador, você pode inscrever quantas equipes quiser.</p>' : ""}
          <p class="erro-inscricao" id="erroInscricao" role="status"></p>
        </form>`
      : `<p class="mensagem-info">Entre na sua conta para inscrever uma equipe.
          <button class="aba" type="button" id="entrarParaInscricao">Entrar</button>
        </p>`;
  } else if (!podeInscrever) {
    formulario = '<p class="mensagem-info">As inscrições foram encerradas pelo organizador.</p>';
  } else {
    formulario = `<p class="mensagem-info">Sua inscrição: <strong>${escapar(inscricaoDoUsuario.team_name)}</strong>.
      ${ehCriador ? "" : campeonato.inscricoesAbertas
        ? `<button class="botao-excluir" type="button" data-remover-inscricao="${inscricaoDoUsuario.id}">Cancelar inscrição</button>`
        : ""}
    </p>`;
  }
  const lista = inscricoes.length
    ? `<div class="lista-inscricoes">${inscricoes.map((item) => `<article class="item-inscricao">
        <div><strong>${escapar(item.team_name)}</strong></div>
        ${ehCriador && podeInscrever
          ? `<button class="botao-excluir" type="button" data-remover-inscricao="${item.id}">Recusar</button>`
          : ""}
      </article>`).join("")}</div>`
    : '<p class="mensagem-info">Ainda não há equipes inscritas.</p>';
  conteudo.innerHTML = `<p class="status-inscricoes ${podeInscrever ? "abertas" : "encerradas"}">
    ${podeInscrever ? "Inscrições abertas" : "Inscrições encerradas"} • ${inscricoes.length}
    ${inscricoes.length === 1 ? "equipe inscrita" : "equipes inscritas"}
  </p>${formulario}<h3 class="titulo-inscritos">Equipes inscritas</h3>${lista}`;

  const entrar = document.getElementById("entrarParaInscricao");
  if (entrar) entrar.addEventListener("click", () => window.arenaStore.openAuth());
  const form = document.getElementById("formInscricao");
  if (form) form.addEventListener("submit", enviarInscricao);
  conteudo.querySelectorAll("[data-remover-inscricao]").forEach((button) => {
    button.addEventListener("click", () => void removerInscricao(button.dataset.removerInscricao));
  });
}
async function enviarInscricao(evento) {
  evento.preventDefault();
  if (!campeonato || !campeonato.inscricoesAbertas) return;
  if (!window.arenaStore.user) {
    window.arenaStore.openAuth();
    return;
  }
  const teamName = document.getElementById("nomeEquipeInscricao").value.trim();
  const erro = document.getElementById("erroInscricao");
  if (!teamName) {
    erro.textContent = "Informe um nome para a equipe.";
    return;
  }
  if (inscricoes.some((item) => item.team_name.toLocaleLowerCase() === teamName.toLocaleLowerCase())) {
    erro.textContent = "Já existe uma equipe com esse nome.";
    return;
  }
  try {
    await window.arenaStore.register(campeonato.id, teamName);
    inscricoes = await window.arenaStore.listRegistrations(campeonato.id);
    atualizarInscricoesNaTela();
    renderizar();
  } catch (error) {
    erro.textContent = error.message || "Não foi possível concluir a inscrição.";
  }
}
async function removerInscricao(id) {
  const inscricao = inscricoes.find((item) => item.id === id);
  if (!inscricao || (!ehOrganizador() && inscricao.user_id !== window.arenaStore.user?.id)) return;
  const acao = ehOrganizador() ? "recusar a inscrição de " : "cancelar a inscrição de ";
  if (!confirm(`Deseja ${acao}${inscricao.team_name}?`)) return;
  try {
    await window.arenaStore.removeRegistration(id);
    inscricoes = await window.arenaStore.listRegistrations(campeonato.id);
    atualizarInscricoesNaTela();
    renderizar();
  } catch (error) {
    window.arenaStore.showError(error);
  }
}
async function iniciarCampeonato() {
  if (!campeonato || !exigirOrganizador() || !campeonato.inscricoesAbertas) return;
  const participantes = inscricoes.map((item) => item.team_name);
  if (participantes.length < 2 ||
      (campeonato.formato === "grupos" && participantes.length < 4) ||
      (campeonato.formato === "dupla" &&
        (participantes.length < 4 || (participantes.length & (participantes.length - 1)) !== 0))) {
    alert(campeonato.formato === "dupla"
      ? "A eliminação dupla precisa de 4, 8, 16 (ou outra potência de 2) duplas/equipes."
      : campeonato.formato === "grupos"
        ? "Para usar grupos + mata-mata, inscreva pelo menos 4 duplas/equipes."
        : "Inscreva pelo menos 2 duplas/equipes para iniciar.");
    return;
  }
  if (!confirm("Encerrar as inscrições e montar a tabela com as duplas/equipes inscritas?")) return;
  campeonato.participantes = participantes;
  campeonato.inscricoesAbertas = false;
  campeonato.fases = [];
  prepararCampeonato();
  atualizarFasesConcluidas();
  const salvo = await salvarDados();
  if (!salvo) {
    campeonato.inscricoesAbertas = true;
    campeonato.participantes = [];
    campeonato.fases = [];
    return;
  }
  abaAtual = "jogos";
  renderizar();
}
function voltarUmaRodada() {
  if (!campeonato || !exigirOrganizador() || !campeonato.fases.length) return;
  if (campeonato.formato === "dupla") {
    if (!confirm("Voltar no chaveamento de eliminação dupla reiniciará as duas chaves e seus placares. Deseja continuar?")) return;
    campeonato.fases = criarChaveDupla(campeonato.participantes);
    atualizarFasesConcluidas();
    salvarDados();
    renderizar();
    return;
  }
  const fasesMata = campeonato.fases.filter((fase) => fase.tipo === "mata");
  if (fasesMata.length > 1) {
    const chaveCompleta = fasesMata.some((fase) => fase.jogos.some((jogo) => jogo.proximoJogoId));
    if (chaveCompleta) {
      let rodadaAtual = -1;
      fasesMata.forEach((fase, indice) => {
        if (fase.jogos.some((jogo) => !jogo.folga && jogoConcluido(jogo))) rodadaAtual = indice;
      });
      if (rodadaAtual < 0) {
        alert("Ainda não há resultados eliminatórios para voltar.");
        return;
      }
      if (!confirm(`Limpar os resultados a partir de "${fasesMata[rodadaAtual].nome}"?`)) return;
      fasesMata.slice(rodadaAtual).forEach((fase) => fase.jogos.forEach((jogo) => {
        if (jogo.folga) return;
        jogo.placarA = null;
        jogo.placarB = null;
        delete jogo.desistente;
        delete jogo.quadra;
        delete jogo.statusQuadra;
      }));
      propagarVencedoresMata();
    } else {
      const ultima = fasesMata[fasesMata.length - 1];
      if (!confirm(`Voltar da fase "${ultima.nome}"? Os resultados dessa fase serão removidos.`)) return;
      campeonato.fases = campeonato.fases.filter((fase) => fase !== ultima && fase.tipo !== "terceiro");
    }
  } else if (fasesMata.length === 1) {
    const fase = fasesMata[0];
    if (!confirm("Limpar os resultados da rodada eliminatória atual?")) return;
    fase.jogos.forEach((jogo) => {
      if (!jogo.folga) { jogo.placarA = null; jogo.placarB = null; delete jogo.desistente; }
    });
  } else {
    const fase = campeonato.fases[campeonato.fases.length - 1];
    const jogos = todosOsJogos(fase);
    const ultimaRodada = Math.max(...jogos.map((jogo) => jogo.rodada || 1));
    if (!confirm(`Limpar os resultados da rodada ${ultimaRodada}?`)) return;
    jogos.filter((jogo) => (jogo.rodada || 1) === ultimaRodada).forEach((jogo) => {
      jogo.placarA = null; jogo.placarB = null; delete jogo.desistente;
    });
  }
  atualizarFasesConcluidas();
  salvarDados();
  renderizar();
}
function sortearGrupos() {
  if (!campeonato || !exigirOrganizador() || campeonato.formato !== "grupos") return;
  if (!confirm("Sortear novamente os grupos? Os jogos, placares e o mata-mata atual serão reiniciados.")) return;
  campeonato.fases = [];
  prepararCampeonato();
  atualizarFasesConcluidas();
  salvarDados();
  abaAtual = "jogos";
  renderizar();
}
function classificadosDosGrupos() {
  const faseGrupos = campeonato.fases.find((fase) => fase.tipo === "grupos");
  if (!faseGrupos || !faseGrupos.concluida) return null;
  const classificados = [];
  faseGrupos.grupos.forEach((grupo) => {
    const tabela = calcularClassificacao(grupo.participantes, grupo.jogos);
    if (tabela.length >= 2) classificados.push(tabela[0].nome, tabela[1].nome);
  });
  return classificados.length >= 2 ? classificados : null;
}
function sortearMataMata() {
  if (!campeonato || !exigirOrganizador() || campeonato.formato === "todos") return;
  let participantes;
  if (campeonato.formato === "grupos") {
    participantes = classificadosDosGrupos();
    if (!participantes) {
      alert("Conclua todos os jogos dos grupos antes de sortear o mata-mata.");
      return;
    }
  } else {
    participantes = campeonato.participantes;
  }
  if (!confirm("Sortear novamente o mata-mata? As fases eliminatórias e seus placares atuais serão removidos.")) return;
  if (campeonato.formato === "dupla") {
    campeonato.fases = criarChaveDupla(participantes);
  } else {
    campeonato.fases = campeonato.fases.filter((fase) => fase.tipo !== "mata" && fase.tipo !== "terceiro");
    criarChaveamentoCompleto(participantes);
  }
  atualizarFasesConcluidas();
  salvarDados();
  abaAtual = "chaveamento";
  renderizar();
}
function gerarId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function escapar(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}
function nomeFormato(formato) {
  if (formato === "mata") return "Mata-mata";
  if (formato === "dupla") return "Eliminação dupla";
  if (formato === "grupos") return "Fase de grupos + mata-mata";
  return "Todos contra todos";
}
function embaralhar(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}
function criarJogosTodosContraTodos(participantes, grupo = null) {
  const lista = [...participantes];
  if (lista.length % 2 !== 0) lista.push(null);
  const quantidade = lista.length;
  const jogos = [];
  for (let rodada = 0; rodada < quantidade - 1; rodada++) {
    for (let i = 0; i < quantidade / 2; i++) {
      const a = lista[i];
      const b = lista[quantidade - 1 - i];
      if (a && b) {
        jogos.push({
          id: gerarId(), rodada: rodada + 1, grupo,
          equipeA: a, equipeB: b, placarA: null, placarB: null
        });
      }
    }
    const fixo = lista[0];
    const resto = lista.slice(1);
    resto.unshift(resto.pop());
    lista.splice(0, lista.length, fixo, ...resto);
  }
  return jogos;
}
function criarMataMata(participantes, nome = "Mata-mata") {
  const lista = embaralhar(participantes);
  const jogos = [];
  for (let i = 0; i < lista.length; i += 2) {
    if (i + 1 < lista.length) {
      jogos.push({
        id: gerarId(), rodada: 1, equipeA: lista[i], equipeB: lista[i + 1],
        placarA: null, placarB: null
      });
    } else {
      jogos.push({
        id: gerarId(), rodada: 1, equipeA: lista[i], equipeB: null,
        placarA: null, placarB: null, vencedor: lista[i], folga: true
      });
    }
  }
  return { nome, tipo: "mata", jogos, concluida: false };
}
function criarChaveamentoCompleto(participantes) {
  const classificados = embaralhar(participantes);
  let tamanhoChave = 1;
  while (tamanhoChave < classificados.length) tamanhoChave *= 2;
  const quantidadeFolgas = tamanhoChave - classificados.length;
  const quantidadeJogosReais = tamanhoChave / 2 - quantidadeFolgas;

  const rodadas = [];
  let quantidadeJogos = tamanhoChave / 2;
  let numeroRodada = 1;
  while (quantidadeJogos >= 1) {
    const nome = quantidadeJogos === 1
      ? "Final"
      : quantidadeJogos === 2
        ? "Semifinal"
        : quantidadeJogos === 4
          ? "Quartas de final"
          : "Rodada " + numeroRodada;
    rodadas.push({
      nome,
      tipo: "mata",
      jogos: Array.from({ length: quantidadeJogos }, () => ({
        id: gerarId(), rodada: numeroRodada,
        equipeA: null, equipeB: null, placarA: null, placarB: null
      })),
      concluida: false
    });
    quantidadeJogos /= 2;
    numeroRodada++;
  }

  const jogosPrimeiraRodada = rodadas[0].jogos;
  let indiceParticipante = 0;
  jogosPrimeiraRodada.forEach((jogo, indice) => {
    if (indice < quantidadeJogosReais) {
      jogo.equipeA = classificados[indiceParticipante++];
      jogo.equipeB = classificados[indiceParticipante++];
    } else {
      jogo.equipeA = classificados[indiceParticipante++];
      jogo.equipeB = null;
      jogo.folga = true;
      jogo.vencedor = jogo.equipeA;
    }
  });
  for (let indiceRodada = 0; indiceRodada < rodadas.length - 1; indiceRodada++) {
    rodadas[indiceRodada].jogos.forEach((jogo, indiceJogo) => {
      const destino = rodadas[indiceRodada + 1].jogos[Math.floor(indiceJogo / 2)];
      jogo.proximoJogoId = destino.id;
      jogo.destinoLado = indiceJogo % 2 === 0 ? "A" : "B";
    });
  }
  campeonato.fases.push(...rodadas);
  if (rodadas.length >= 2 && rodadas[rodadas.length - 2].jogos.length === 2) {
    const disputaTerceiro = {
      nome: "Disputa de 3º lugar",
      tipo: "terceiro",
      jogos: [{
        id: gerarId(), rodada: 1,
        equipeA: null, equipeB: null, placarA: null, placarB: null
      }],
      concluida: false
    };
    rodadas[rodadas.length - 2].jogos.forEach((jogo, indice) => {
      jogo.proximoPerdedorJogoId = disputaTerceiro.jogos[0].id;
      jogo.destinoPerdedorLado = indice === 0 ? "A" : "B";
    });
    campeonato.fases.push(disputaTerceiro);
  }
  propagarVencedoresMata();
  return rodadas;
}
function criarFaseDupla(participantes, nome, tipo) {
  const fase = criarMataMata(participantes, nome);
  fase.tipo = tipo;
  return fase;
}
function criarChaveDupla(participantes) {
  return [criarFaseDupla(participantes, "Chave dos vencedores — rodada 1", "dupla-superior")];
}
function prepararCampeonato() {
  if (!campeonato || campeonato.participantes.length < 2) return;
  if (!Array.isArray(campeonato.fases)) campeonato.fases = [];
  if (campeonato.fases.length) return;

  if (campeonato.formato === "todos") {
    campeonato.fases.push({
      nome: "Todos contra todos", tipo: "liga",
      jogos: criarJogosTodosContraTodos(campeonato.participantes),
      concluida: false
    });
  } else if (campeonato.formato === "mata") {
    criarChaveamentoCompleto(campeonato.participantes);
  } else if (campeonato.formato === "dupla") {
    campeonato.fases.push(...criarChaveDupla(campeonato.participantes));
  } else {
    const participantes = embaralhar(campeonato.participantes);
    const quantidadeGrupos = participantes.length >= 8 ? 4 : 2;
    const grupos = Array.from({ length: quantidadeGrupos }, () => []);
    participantes.forEach((p, i) => grupos[i % quantidadeGrupos].push(p));
    campeonato.fases.push({
      nome: "Fase de grupos",
      tipo: "grupos",
      grupos: grupos.map((integrantes, indice) => ({
        nome: "Grupo " + String.fromCharCode(65 + indice),
        participantes: integrantes,
        jogos: criarJogosTodosContraTodos(integrantes, "Grupo " + String.fromCharCode(65 + indice))
      })),
      concluida: false
    });
  }
}
function jogoConcluido(jogo) {
  return jogo.placarA !== null && jogo.placarB !== null &&
    jogo.placarA !== "" && jogo.placarB !== "" &&
    Number.isFinite(Number(jogo.placarA)) &&
    Number.isFinite(Number(jogo.placarB)) &&
    Number(jogo.placarA) >= 0 && Number(jogo.placarB) >= 0;
}
function jogoPronto(jogo) {
  return Boolean(jogo.equipeA && jogo.equipeB) && !jogo.folga;
}
function vencedorDoJogo(jogo) {
  if (jogo.folga) return jogo.equipeA;
  if (!jogoConcluido(jogo)) return null;
  const a = Number(jogo.placarA), b = Number(jogo.placarB);
  if (a === b) return null;
  return a > b ? jogo.equipeA : jogo.equipeB;
}
function perdedorDoJogo(jogo) {
  const vencedor = vencedorDoJogo(jogo);
  if (!vencedor || jogo.folga) return null;
  return vencedor === jogo.equipeA ? jogo.equipeB : jogo.equipeA;
}
function todosJogosConcluidos(jogos) {
  return jogos.every((jogo) => jogo.folga || jogoConcluido(jogo));
}
function todosOsJogos(fase) {
  return fase.tipo === "grupos" ? fase.grupos.flatMap((g) => g.jogos) : (fase.jogos || []);
}
function propagarVencedoresMata() {
  const jogosChave = campeonato.fases
    .filter((fase) => fase.tipo === "mata" || fase.tipo === "terceiro")
    .flatMap((fase) => fase.jogos);
  campeonato.fases.filter((fase) => fase.tipo === "mata").forEach((fase) =>
    fase.jogos.forEach((jogo) => {
      const avancos = [
        { id: jogo.proximoJogoId, lado: jogo.destinoLado, participante: vencedorDoJogo(jogo) },
        { id: jogo.proximoPerdedorJogoId, lado: jogo.destinoPerdedorLado, participante: perdedorDoJogo(jogo) }
      ];
      avancos.forEach(({ id, lado, participante }) => {
        if (!id) return;
        const destino = jogosChave.find((proximo) => proximo.id === id);
        if (!destino) return;
        const equipeAtual = lado === "A" ? destino.equipeA : destino.equipeB;
        if (equipeAtual === participante) return;
        if (!destino.folga) {
          destino.placarA = null;
          destino.placarB = null;
          delete destino.desistente;
          delete destino.quadra;
          delete destino.statusQuadra;
        }
        if (lado === "A") destino.equipeA = participante;
        else destino.equipeB = participante;
      });
    })
  );
  atualizarFasesConcluidas();
}
function obterQuantidadeQuadras() {
  return Number.isInteger(campeonato.quadras) && campeonato.quadras > 0 ? campeonato.quadras : 1;
}
function todosJogosCampeonato() {
  return campeonato.fases.flatMap(todosOsJogos);
}
function jogoPorId(idJogo) {
  return todosJogosCampeonato().find((jogo) => jogo.id === idJogo);
}
function statusQuadra(jogo) {
  if (jogo.statusQuadra === "em-andamento") return "Em andamento";
  if (jogo.statusQuadra === "proximo") return "Próximo";
  return "";
}
function classeStatusQuadra(jogo) {
  if (jogo.statusQuadra === "em-andamento") return "jogo-em-andamento";
  if (jogo.statusQuadra === "proximo") return "jogo-proximo";
  return "";
}
function opcoesQuadras(quadraSelecionada) {
  return `<option value="">Sem quadra</option>${Array.from({ length: obterQuantidadeQuadras() }, (_, indice) => {
    const numero = indice + 1;
    return `<option value="${numero}" ${Number(quadraSelecionada) === numero ? "selected" : ""}>Quadra ${numero}</option>`;
  }).join("")}`;
}
function promoverProximoJogo(quadra) {
  if (!quadra || todosJogosCampeonato().some((jogo) =>
    jogo.quadra === quadra && jogo.statusQuadra === "em-andamento"
  )) return;
  const proximoJogo = todosJogosCampeonato().find((jogo) =>
    jogo.quadra === quadra && jogo.statusQuadra === "proximo"
  );
  if (proximoJogo) proximoJogo.statusQuadra = "em-andamento";
}
function liberarQuadraJogo(jogo) {
  const quadraAnterior = jogo.quadra;
  delete jogo.statusQuadra;
  promoverProximoJogo(quadraAnterior);
}
function aplicarQuadraJogo(jogo, quadra) {
  const quadraAnterior = jogo.quadra;
  const statusAnterior = jogo.statusQuadra;
  if (!quadra) {
    delete jogo.quadra;
    delete jogo.statusQuadra;
    promoverProximoJogo(quadraAnterior);
    return;
  }
  const quadraSelecionada = Number(quadra);
  const jogoEmAndamento = todosJogosCampeonato().find((outroJogo) =>
    outroJogo !== jogo && outroJogo.quadra === quadraSelecionada &&
    outroJogo.statusQuadra === "em-andamento"
  );
  jogo.quadra = quadraSelecionada;
  jogo.statusQuadra = jogoEmAndamento ? "proximo" : "em-andamento";
  if (quadraAnterior !== quadraSelecionada && statusAnterior === "em-andamento") {
    promoverProximoJogo(quadraAnterior);
  }
}
function atualizarQuadraJogo(idJogo, quadra) {
  if (!exigirOrganizador()) return;
  const jogo = jogoPorId(idJogo);
  if (!jogo) return;
  aplicarQuadraJogo(jogo, quadra);
  void salvarDados().then((salvo) => {
    if (salvo) sincronizarElegiveisInterclasse();
  });
  renderizar();
}
function controlesQuadraJogo(jogo) {
  if (!ehOrganizador()) return "";
  return `<div class="controles-quadra">
    <label>Quadra
      <select data-quadra-jogo="${jogo.id}">${opcoesQuadras(jogo.quadra)}</select>
    </label>
  </div>`;
}
function indicadorQuadraJogo(jogo) {
  if (!jogo.quadra) return "";
  const status = statusQuadra(jogo);
  return `<small class="indicador-quadra ${classeStatusQuadra(jogo)}">Quadra ${jogo.quadra}${status ? " • " + status : ""}</small>`;
}
function calcularClassificacao(participantes, jogos) {
  const tabela = participantes.map((nome) => ({
    nome, jogos: 0, vitorias: 0, empates: 0, derrotas: 0,
    golsPro: 0, golsContra: 0, pontos: 0
  }));
  const buscar = (nome) => tabela.find((item) => item.nome === nome);
  jogos.forEach((jogo) => {
    if (!jogoConcluido(jogo)) return;
    const a = buscar(jogo.equipeA), b = buscar(jogo.equipeB);
    if (!a || !b) return;
    const pa = Number(jogo.placarA), pb = Number(jogo.placarB);
    a.jogos++; b.jogos++;
    a.golsPro += pa; a.golsContra += pb;
    b.golsPro += pb; b.golsContra += pa;
    if (pa > pb) { a.vitorias++; b.derrotas++; a.pontos += 3; }
    else if (pb > pa) { b.vitorias++; a.derrotas++; b.pontos += 3; }
    else { a.empates++; b.empates++; a.pontos++; b.pontos++; }
  });
  return tabela.sort((a, b) =>
    b.pontos - a.pontos ||
    (b.golsPro - b.golsContra) - (a.golsPro - a.golsContra) ||
    b.golsPro - a.golsPro || a.nome.localeCompare(b.nome)
  );
}
function atualizarFasesConcluidas() {
  campeonato.fases.forEach((fase) => {
    fase.concluida = todosJogosConcluidos(todosOsJogos(fase));
  });
}
function renderizarJogos(jogos) {
  if (!jogos.length) return '<p class="mensagem-info">Não há jogos nesta fase.</p>';
  return `<div class="lista-jogos">${jogos.map((jogo) => {
    const concluido = jogoConcluido(jogo);
    const pronto = jogoPronto(jogo);
    const editavel = pronto && ehOrganizador();
    const equipeA = jogo.equipeA || "Aguardando classificado";
    const equipeB = jogo.equipeB || (jogo.folga ? "Folga" : "Aguardando classificado");
    return `<article class="bloco-jogo ${classeStatusQuadra(jogo)}">
      <div class="nome-equipe">${escapar(equipeA)}</div>
      <div class="placar">${jogo.folga ? "<strong>Avança automaticamente</strong>" : !pronto ? "<strong>Aguardando classificados</strong>" : !editavel ? concluido ? `<strong>${jogo.placarA} : ${jogo.placarB}</strong>` : "<strong>Placar a definir</strong>" : `
        <input type="number" min="0" step="1" aria-label="Placar de ${escapar(jogo.equipeA)}"
          data-jogo="${jogo.id}" data-lado="A" value="${concluido ? jogo.placarA : ""}" placeholder="-">
        <span>:</span>
        <input type="number" min="0" step="1" aria-label="Placar de ${escapar(jogo.equipeB)}"
          data-jogo="${jogo.id}" data-lado="B" value="${concluido ? jogo.placarB : ""}" placeholder="-">
        <button class="botao-pequeno" data-salvar-jogo="${jogo.id}">Salvar</button>`}
      </div>
      <div class="nome-equipe">${escapar(equipeB)}</div>
      ${pronto ? controlesQuadraJogo(jogo) : ""}
      ${concluido ? `<small>Resultado registrado${vencedorDoJogo(jogo) ? " • Vencedor: " + escapar(vencedorDoJogo(jogo)) : " • Empate"}</small>` : ""}
    </article>`;
  }).join("")}</div>`;
}
function renderizarJogosChave(jogos) {
  if (!jogos.length) return '<p class="mensagem-info">Aguardando participantes.</p>';
  return `<div class="lista-jogos lista-jogos-chave">${jogos.map((jogo) => {
    const concluido = jogoConcluido(jogo);
    const pronto = jogoPronto(jogo);
    const editavel = pronto && ehOrganizador();
    const placar = concluido ? `${jogo.placarA} : ${jogo.placarB}` : editavel ? "Definir placar" : "Aguardando";
    return `<article class="bloco-jogo bloco-jogo-chave ${classeStatusQuadra(jogo)} ${editavel ? "editavel" : ""}" ${editavel ? `data-editar-jogo="${jogo.id}" tabindex="0" role="button" aria-label="Editar placar de ${escapar(jogo.equipeA)} contra ${escapar(jogo.equipeB)}"` : ""}>
      <span class="nome-equipe">${escapar(jogo.equipeA || "Aguardando classificado")}</span>
      <strong class="placar-resumo">${jogo.folga ? "Folga" : pronto ? placar : "Aguardando"}</strong>
      <span class="nome-equipe">${escapar(jogo.equipeB || (jogo.folga ? "Avança automaticamente" : "Aguardando classificado"))}</span>
      ${indicadorQuadraJogo(jogo)}
    </article>`;
  }).join("")}</div>`;
}
function renderizarTabela(participantes, jogos) {
  const tabela = calcularClassificacao(participantes, jogos);
  return `<div class="tabela-scroll"><table class="tabela-classificacao">
    <thead><tr><th>Pos.</th><th>Participante</th><th>J</th><th>V</th><th>E</th><th>D</th><th>SG</th><th>Pts</th></tr></thead>
    <tbody>${tabela.map((item, i) => `<tr>
      <td>${i + 1}º</td><td>${escapar(item.nome)}</td><td>${item.jogos}</td>
      <td>${item.vitorias}</td><td>${item.empates}</td><td>${item.derrotas}</td>
      <td>${item.golsPro - item.golsContra}</td><td><strong>${item.pontos}</strong></td>
    </tr>`).join("")}</tbody></table></div>`;
}
function renderizarJogosAba() {
  if (!campeonato.fases.length) {
    return '<p class="mensagem-info">A tabela será montada quando o organizador encerrar as inscrições.</p>';
  }
  return campeonato.fases.map((fase) => `<section class="bloco-fase">
    <h3>${escapar(fase.nome)}</h3>
    ${fase.tipo === "grupos"
      ? fase.grupos.map((grupo) => `<h4>${escapar(grupo.nome)}</h4>${renderizarJogos(grupo.jogos)}`).join("")
      : renderizarJogos(fase.jogos)}
  </section>`).join("");
}
function renderizarClassificacao() {
  const html = campeonato.fases.map((fase) => {
    if (fase.tipo === "grupos") return `<section class="bloco-classificacao">
      <h3>${escapar(fase.nome)}</h3>${fase.grupos.map((grupo) =>
        `<h4>${escapar(grupo.nome)}</h4>${renderizarTabela(grupo.participantes, grupo.jogos)}`
      ).join("")}</section>`;
    if (fase.tipo === "liga") return `<section class="bloco-classificacao">
      <h3>${escapar(fase.nome)}</h3>${renderizarTabela(campeonato.participantes, fase.jogos)}
    </section>`;
    return "";
  }).join("");
  return html || '<p class="mensagem-info">A classificação é exibida nas fases de liga e grupos.</p>';
}
function nomeRodada(indice) {
  const fase = campeonato.fases.filter((item) => item.tipo === "mata")[indice];
  const jogos = fase ? fase.jogos.length : 0;
  if (jogos === 1) return "Final";
  if (jogos === 2) return "Semifinal";
  if (jogos === 4) return "Quartas de final";
  return "Rodada " + (indice + 1);
}
function renderizarPodio(primeiro, segundo, terceiro) {
  const colocacoes = [
    { posicao: "1º lugar", nome: primeiro, classe: "podio-primeiro", medalha: "🏆" },
    { posicao: "2º lugar", nome: segundo, classe: "podio-segundo", medalha: "🥈" },
    { posicao: "3º lugar", nome: terceiro, classe: "podio-terceiro", medalha: "🥉" }
  ];
  return `<section class="podio-campeonato" aria-label="Classificação final">
    <div class="cabecalho-podio">
      <span class="etiqueta-campeao">RESULTADO FINAL</span>
      <h3>Pódio do campeonato</h3>
    </div>
    <div class="lista-podio">${colocacoes.map((colocacao) => `<article class="cartao-podio ${colocacao.classe} ${colocacao.nome ? "" : "podio-pendente"}">
      <span class="medalha-podio" aria-hidden="true">${colocacao.medalha}</span>
      <div><span class="posicao-podio">${colocacao.posicao}</span>
        <strong>${colocacao.nome ? escapar(colocacao.nome) : "A definir"}</strong>
        ${!colocacao.nome && colocacao.classe === "podio-terceiro" ? '<small>Aguardando a disputa de 3º lugar</small>' : ""}
      </div>
    </article>`).join("")}</div>
  </section>`;
}
function renderizarChaveamento() {
  if (campeonato.formato === "dupla") return renderizarChaveamentoDuplo();
  const fasesMata = campeonato.fases.filter((fase) => fase.tipo === "mata");
  const fasesChave = [...fasesMata, ...campeonato.fases.filter((fase) => fase.tipo === "terceiro")];
  const faseGrupos = campeonato.fases.find((fase) => fase.tipo === "grupos");
  let html = "";
  if (faseGrupos && !fasesMata.length) html += `<section class="bloco-fase"><h3>Classificar para o mata-mata</h3><p class="mensagem-info">Quando os grupos terminarem, os dois primeiros de cada grupo avançam ao chaveamento.</p>${ehOrganizador() ? '<button class="botao" id="gerarMata">Gerar chaveamento</button>' : ""}</section>`;
  if (fasesChave.length) {
    html += `<section class="bloco-chaveamento"><h3>Chaveamento eliminatório</h3><div class="chaveamento">${fasesChave.map((fase, indice) => `<div class="coluna-chave ${fase.tipo === "terceiro" ? "coluna-terceiro" : ""}"><h4>${escapar(fase.nome === "Mata-mata" ? nomeRodada(indice) : fase.nome)}</h4><div class="jogos-chave">${fase.jogos.map((jogo) => {
      const vencedor = vencedorDoJogo(jogo);
      const pronto = jogoPronto(jogo);
      const editavel = pronto && ehOrganizador();
      return `<article class="partida-chave ${classeStatusQuadra(jogo)} ${editavel ? "editavel" : ""}" ${editavel ? `data-editar-jogo="${jogo.id}" tabindex="0" role="button" aria-label="Editar placar de ${escapar(jogo.equipeA)} contra ${escapar(jogo.equipeB)}"` : ""}><div class="equipe-chave ${vencedor === jogo.equipeA ? "vencedora" : ""}"><span>${escapar(jogo.equipeA || "Aguardando classificado")}</span><strong>${jogo.folga ? "-" : jogoConcluido(jogo) ? jogo.placarA : "-"}</strong></div><div class="equipe-chave ${vencedor === jogo.equipeB ? "vencedora" : ""}"><span>${jogo.equipeB ? escapar(jogo.equipeB) : jogo.folga ? "Folga" : "Aguardando classificado"}</span><strong>${jogo.folga ? "" : jogoConcluido(jogo) ? jogo.placarB : "-"}</strong></div>${indicadorQuadraJogo(jogo)}<small>${jogo.folga ? "Avanço automático" : !pronto ? "Aguardando os vencedores da rodada anterior" : !ehOrganizador() ? jogoConcluido(jogo) ? "Resultado" : "Aguardando placar do organizador" : jogo.desistente ? "Vitória por desistência" : jogoConcluido(jogo) ? "Clique para editar" : "Clique para registrar o placar"}</small></article>`;
    }).join("")}</div></div>`).join("")}</div></section>`;
    const ultima = fasesMata[fasesMata.length - 1];
    if (ultima.concluida) {
      const jogoFinal = ultima.jogos[0];
      const campeao = vencedorDoJogo(jogoFinal);
      const viceCampeao = perdedorDoJogo(jogoFinal);
      const disputaTerceiro = campeonato.fases.find((fase) => fase.tipo === "terceiro");
      const terceiroLugar = disputaTerceiro && disputaTerceiro.concluida
        ? vencedorDoJogo(disputaTerceiro.jogos[0])
        : null;
      html += campeao
        ? renderizarPodio(campeao, viceCampeao, terceiroLugar)
        : `<section class="bloco-fase"><h3>Próxima rodada</h3><button class="botao" id="gerarProximaRodada">Gerar próxima rodada</button></section>`;
    }
  }
  return html || '<p class="mensagem-info">O chaveamento aparecerá quando a fase eliminatória for criada.</p>';
}
function renderizarChaveamentoDuplo() {
  const superiores = fasesDupla("dupla-superior");
  const inferiores = fasesDupla("dupla-inferior");
  const finais = fasesDupla("dupla-final");
  const final = finais[finais.length - 1];
  const coluna = (titulo, fases, classe) => `<div class="coluna-chave ${classe}"><h4>${titulo}</h4>${fases.length ? fases.map((fase) => `<section class="fase-dupla"><h5>${escapar(fase.nome)}</h5>${renderizarJogosChave(fase.jogos)}</section>`).join("") : '<p class="mensagem-info">Aguardando resultados.</p>'}</div>`;
  let html = `<section class="bloco-chaveamento"><h3>Chaveamento de eliminação dupla</h3><p class="mensagem-info">A primeira derrota leva o participante para a chave dos perdedores. A segunda elimina da competição.</p><div class="chaveamento chaveamento-duplo">${coluna("Chave dos vencedores", superiores, "coluna-vencedores")}${coluna("Chave dos perdedores", inferiores, "coluna-perdedores")}${coluna("Grande final", final ? [final] : [], "coluna-final")}</div></section>`;
  html = `<section class="bloco-chaveamento chaveamento-dupla-espelho"><div class="titulo-chave-dupla"><div><h3>Eliminação dupla</h3><p>Vencedores avançam pela esquerda; quem perde uma vez segue pela chave da direita.</p></div><span>Dupla eliminação</span></div><div class="arvore-dupla"><div class="lado-chave lado-vencedores">${superiores.map((fase) => coluna(escapar(fase.nome), [fase], "coluna-vencedores")).join("")}</div><div class="centro-chave-final">${final ? coluna("Grande final", [final], "coluna-final") : '<div class="aguardando-final"><strong>Grande final</strong><span>Aguardando finalistas</span></div>'}</div><div class="lado-chave lado-perdedores">${[...inferiores].reverse().map((fase) => coluna(escapar(fase.nome), [fase], "coluna-perdedores")).join("") || '<div class="aguardando-lado">A chave dos perdedores aparecerá após a primeira rodada.</div>'}</div></div></section>`;
  html = `<section class="bloco-chaveamento chaveamento-modelo"><div class="titulo-chave-modelo"><div><h3>Eliminação dupla</h3><p><strong>V</strong> = chave dos vencedores · <strong>P</strong> = chave dos perdedores</p></div><span>Dupla eliminação</span></div><div class="estrutura-dupla"><div class="arvores-dupla"><section class="faixa-chave faixa-vencedores"><h4>Chave dos vencedores</h4><div class="fluxo-chave">${superiores.map((fase, indice) => coluna(`V · Rodada ${indice + 1}`, [fase], "coluna-vencedores")).join("")}</div></section><section class="faixa-chave faixa-perdedores"><h4>Chave dos perdedores</h4><div class="fluxo-chave">${inferiores.map((fase, indice) => coluna(`P · Rodada ${indice + 1}`, [fase], "coluna-perdedores")).join("") || '<div class="aguardando-lado">Os perdedores da primeira rodada aparecerão aqui.</div>'}</div></section></div><aside class="painel-finais"><h4>Finais</h4>${final ? coluna("Final", [final], "coluna-final") : '<div class="aguardando-final"><strong>Grande final</strong><span>Aguardando os campeões das duas chaves.</span></div>'}</aside></div></section>`;
  const finalistaVencedoresFoiCampeao = final && vencedorDoJogo(final.jogos[0]) === final.origemVencedores;
  if (final && final.concluida && (finais.length > 1 || finalistaVencedoresFoiCampeao)) {
    const jogoFinal = final.jogos[0];
    const campeao = vencedorDoJogo(jogoFinal);
    const viceCampeao = perdedorDoJogo(jogoFinal);
    const ultimaFasePerdedores = inferiores[inferiores.length - 1];
    const jogoTerceiro = ultimaFasePerdedores && ultimaFasePerdedores.jogos.length === 1
      ? ultimaFasePerdedores.jogos[0]
      : null;
    const terceiroLugar = jogoTerceiro && jogoConcluido(jogoTerceiro)
      ? perdedorDoJogo(jogoTerceiro)
      : null;
    html += renderizarPodio(campeao, viceCampeao, terceiroLugar);
  } else {
    const textoBotao = final && final.concluida ? "Gerar jogo decisivo" : "Avançar chaveamento";
    html += `<section class="bloco-fase"><h3>Próximo avanço</h3>${ehOrganizador() ? `<button class="botao" id="avancarDupla">${textoBotao}</button>` : '<p class="mensagem-info">O organizador controla o avanço do chaveamento.</p>'}</section>`;
  }
  return html;
}
function gerarMataMataDosGrupos() {
  if (!exigirOrganizador()) return;
  const fase = campeonato.fases.find((f) => f.tipo === "grupos");
  if (!fase || !fase.concluida) {
    alert("Registre todos os resultados da fase de grupos primeiro.");
    return;
  }
  if (campeonato.fases.some((f) => f.tipo === "mata")) {
    alert("O mata-mata já foi criado.");
    return;
  }
  const classificados = [];
  fase.grupos.forEach((grupo) => {
    const tabela = calcularClassificacao(grupo.participantes, grupo.jogos);
    if (tabela.length >= 2) classificados.push(tabela[0].nome, tabela[1].nome);
  });
  if (classificados.length < 2) {
    alert("Não há participantes suficientes para criar o mata-mata.");
    return;
  }
  criarChaveamentoCompleto(classificados);
  salvarDados(); renderizar();
}
function gerarProximaRodada() {
  if (!exigirOrganizador()) return;
  const fase = [...campeonato.fases].reverse().find((f) => f.tipo === "mata");
  if (!fase || !fase.concluida) {
    alert("Registre todos os resultados desta rodada antes de avançar.");
    return;
  }
  const vencedores = fase.jogos.map(vencedorDoJogo).filter(Boolean);
  if (vencedores.length === 1) {
    alert("O campeonato terminou! Campeão: " + vencedores[0]);
    return;
  }
  if (vencedores.length < 2) {
    alert("Não foi possível determinar os classificados.");
    return;
  }
  const numero = campeonato.fases.filter((f) => f.tipo === "mata").length + 1;
  campeonato.fases.push(criarMataMata(vencedores, "Rodada " + numero));
  const perdedores = fase.jogos.map(perdedorDoJogo).filter(Boolean);
  if (fase.jogos.length === 2 && perdedores.length === 2 && !campeonato.fases.some((f) => f.tipo === "terceiro")) {
    const disputaTerceiro = criarMataMata(perdedores, "Disputa de 3º lugar");
    disputaTerceiro.tipo = "terceiro";
    campeonato.fases.push(disputaTerceiro);
  }
  salvarDados(); renderizar();
}
function avancarMataAutomaticamente() {
  if (campeonato.fases.some((fase) =>
    fase.tipo === "mata" && fase.jogos.some((jogo) => jogo.proximoJogoId)
  )) {
    propagarVencedoresMata();
    return true;
  }
  const fase = [...campeonato.fases].reverse().find((item) => item.tipo === "mata");
  if (!fase || !fase.concluida) return false;
  const vencedores = fase.jogos.map(vencedorDoJogo).filter(Boolean);
  if (vencedores.length <= 1) return false;
  const numero = campeonato.fases.filter((item) => item.tipo === "mata").length + 1;
  campeonato.fases.push(criarMataMata(vencedores, "Rodada " + numero));
  const perdedores = fase.jogos.map(perdedorDoJogo).filter(Boolean);
  if (fase.jogos.length === 2 && perdedores.length === 2 && !campeonato.fases.some((item) => item.tipo === "terceiro")) {
    const terceiro = criarMataMata(perdedores, "Disputa de 3º lugar");
    terceiro.tipo = "terceiro";
    campeonato.fases.push(terceiro);
  }
  return true;
}
function avancarFasesAutomaticamente() {
  if (!campeonato) return;
  if (campeonato.formato === "grupos") {
    const grupos = campeonato.fases.find((fase) => fase.tipo === "grupos");
    if (grupos && grupos.concluida && !campeonato.fases.some((fase) => fase.tipo === "mata")) {
      const classificados = [];
      grupos.grupos.forEach((grupo) => {
        const tabela = calcularClassificacao(grupo.participantes, grupo.jogos);
        if (tabela.length >= 2) classificados.push(tabela[0].nome, tabela[1].nome);
      });
      if (classificados.length >= 2) criarChaveamentoCompleto(classificados);
    }
  }
  if (campeonato.formato === "mata" || campeonato.formato === "grupos") avancarMataAutomaticamente();
  if (campeonato.formato === "dupla") {
    const superiores = fasesDupla("dupla-superior");
    const inferiores = fasesDupla("dupla-inferior");
    const finais = fasesDupla("dupla-final");
    const superior = superiores[superiores.length - 1];
    const inferior = inferiores[inferiores.length - 1];
    const final = finais[finais.length - 1];
    const podeCriarDecisivo = final && final.concluida && finais.length === 1 && vencedorDoJogo(final.jogos[0]) !== final.origemVencedores;
    const podeAvancarChaves = superior && superior.concluida && (!superior.processada ? (!inferior || inferior.concluida) : inferior && inferior.concluida);
    if (podeCriarDecisivo || (!finais.length && podeAvancarChaves)) avancarEliminacaoDupla();
  }
}
function fasesDupla(tipo) {
  return campeonato.fases.filter((fase) => fase.tipo === tipo);
}
function avancarEliminacaoDupla() {
  if (!exigirOrganizador()) return;
  const superiores = fasesDupla("dupla-superior");
  const inferiores = fasesDupla("dupla-inferior");
  const finais = fasesDupla("dupla-final");
  const superior = superiores[superiores.length - 1];
  const inferior = inferiores[inferiores.length - 1];
  if (finais.length) {
    const ultimaFinal = finais[finais.length - 1];
    if (!ultimaFinal.concluida) {
      alert("Registre o resultado da grande final.");
      return;
    }
    if (finais.length > 1 || vencedorDoJogo(ultimaFinal.jogos[0]) === ultimaFinal.origemVencedores) {
      alert("O campeonato já terminou.");
      return;
    }
    const jogo = ultimaFinal.jogos[0];
    const decisivo = criarFaseDupla([jogo.equipeA, jogo.equipeB], "Grande final — jogo decisivo", "dupla-final");
    decisivo.jogos[0].equipeA = jogo.equipeA;
    decisivo.jogos[0].equipeB = jogo.equipeB;
    campeonato.fases.push(decisivo);
    atualizarFasesConcluidas();
    salvarDados();
    renderizar();
    return;
  }
  if (!superior || !superior.concluida) {
    alert("Registre todos os resultados da chave dos vencedores para avançar.");
    return;
  }
  const vencedoresSuperior = superior.jogos.map(vencedorDoJogo).filter(Boolean);
  if (!superior.processada) {
    if (inferior && !inferior.concluida) {
      alert("Registre todos os resultados da chave dos perdedores para avançar.");
      return;
    }
    const perdedores = superior.jogos.map(perdedorDoJogo).filter(Boolean);
    const sobreviventes = inferior ? inferior.jogos.map(vencedorDoJogo).filter(Boolean) : [];
    superior.processada = true;
    if (vencedoresSuperior.length > 1) {
      campeonato.fases.push(criarFaseDupla(vencedoresSuperior, `Chave dos vencedores — rodada ${superiores.length + 1}`, "dupla-superior"));
    }
    const participantesInferior = [...sobreviventes, ...perdedores];
    if (participantesInferior.length >= 2) {
      campeonato.fases.push(criarFaseDupla(participantesInferior, `Chave dos perdedores — rodada ${inferiores.length + 1}`, "dupla-inferior"));
    }
  } else {
    if (!inferior || !inferior.concluida) {
      alert("Registre todos os resultados da chave dos perdedores para gerar a grande final.");
      return;
    }
    const campeaoVencedores = vencedoresSuperior[0];
    const sobreviventesInferior = inferior.jogos.map(vencedorDoJogo).filter(Boolean);
    if (sobreviventesInferior.length > 1) {
      campeonato.fases.push(criarFaseDupla(sobreviventesInferior, `Chave dos perdedores — rodada ${inferiores.length + 1}`, "dupla-inferior"));
      atualizarFasesConcluidas();
      salvarDados();
      renderizar();
      return;
    }
    const campeaoPerdedores = sobreviventesInferior[0];
    if (!campeaoVencedores || !campeaoPerdedores) {
      alert("Não foi possível determinar os finalistas.");
      return;
    }
    const faseFinal = criarFaseDupla([campeaoVencedores, campeaoPerdedores], "Grande final", "dupla-final");
    faseFinal.jogos[0].equipeA = campeaoVencedores;
    faseFinal.jogos[0].equipeB = campeaoPerdedores;
    faseFinal.origemVencedores = campeaoVencedores;
    campeonato.fases.push(faseFinal);
  }
  atualizarFasesConcluidas();
  salvarDados();
  abaAtual = "chaveamento";
  renderizar();
}
function salvarPlacar(idJogo) {
  if (!exigirOrganizador()) return;
  const inputs = [...document.querySelectorAll(`[data-jogo="${idJogo}"]`)];
  const inputA = inputs.find((i) => i.dataset.lado === "A");
  const inputB = inputs.find((i) => i.dataset.lado === "B");
  if (!inputA || !inputB) return;
  if (inputA.value.trim() === "" || inputB.value.trim() === "" ||
      !Number.isInteger(Number(inputA.value)) || !Number.isInteger(Number(inputB.value)) ||
      Number(inputA.value) < 0 || Number(inputB.value) < 0) {
    alert("Digite dois placares válidos, usando números inteiros a partir de zero.");
    return;
  }
  const jogo = campeonato.fases.flatMap(todosOsJogos).find((j) => j.id === idJogo);
  if (!jogo || jogo.folga) return;
  const fase = campeonato.fases.find((f) => todosOsJogos(f).some((j) => j.id === idJogo));
  const pa = Number(inputA.value), pb = Number(inputB.value);
  if (fase && ["mata", "terceiro", "dupla-superior", "dupla-inferior", "dupla-final"].includes(fase.tipo) && pa === pb) {
    alert("No mata-mata, o placar precisa definir um vencedor. Registre o resultado após o desempate.");
    return;
  }
  jogo.placarA = pa; jogo.placarB = pb;
  delete jogo.desistente;
  liberarQuadraJogo(jogo);
  atualizarFasesConcluidas();
  avancarFasesAutomaticamente();
  void salvarDados().then((salvo) => {
    if (salvo) sincronizarElegiveisInterclasse();
  });
  renderizar();
}
function abrirModalPlacar(idJogo) {
  if (!exigirOrganizador()) return;
  const jogo = campeonato.fases.flatMap(todosOsJogos).find((item) => item.id === idJogo);
  if (!jogo || jogo.folga) return;
  jogoModalAtual = jogo;
  document.getElementById("equipeAModal").textContent = jogo.equipeA;
  document.getElementById("equipeBModal").textContent = jogo.equipeB;
  document.getElementById("confrontoModal").textContent = jogo.equipeA + " × " + jogo.equipeB;
  document.getElementById("placarAModal").value = jogoConcluido(jogo) ? jogo.placarA : "";
  document.getElementById("placarBModal").value = jogoConcluido(jogo) ? jogo.placarB : "";
  document.getElementById("quadraJogoModal").innerHTML = opcoesQuadras(jogo.quadra);
  document.getElementById("desistenciaA").textContent = jogo.equipeA + " desistiu";
  document.getElementById("desistenciaB").textContent = jogo.equipeB + " desistiu";
  const statusApi = document.getElementById("statusApiJogo");
  const recuperar = document.getElementById("recuperarPlacarApi");
  recuperar.hidden = !jogo.interclasseId;
  statusApi.textContent = jogo.interclasseId
    ? `Placar vinculado à API (ID ${jogo.interclasseId}).`
    : jogo.interclasseCriacaoPendente
      ? "Criação ainda sem confirmação; verifique antes de repetir."
      : "Esta partida ainda não tem ID na API.";
  document.getElementById("modalPlacar").showModal();
}
function salvarPlacarModal(evento) {
  evento.preventDefault();
  if (!jogoModalAtual || !exigirOrganizador()) return;
  const inputA = document.getElementById("placarAModal");
  const inputB = document.getElementById("placarBModal");
  const placarPreenchido = inputA.value.trim() !== "" && inputB.value.trim() !== "";
  if ((inputA.value.trim() === "") !== (inputB.value.trim() === "")) {
    alert("Preencha os dois placares ou deixe ambos em branco para salvar apenas a quadra.");
    return;
  }
  const pa = Number(inputA.value), pb = Number(inputB.value);
  if (placarPreenchido && (!Number.isInteger(pa) || !Number.isInteger(pb) || pa < 0 || pb < 0)) {
    alert("Digite dois placares válidos, usando números inteiros a partir de zero.");
    return;
  }
  const fase = campeonato.fases.find((item) => todosOsJogos(item).some((jogo) => jogo.id === jogoModalAtual.id));
  if (placarPreenchido && fase && ["mata", "terceiro", "dupla-superior", "dupla-inferior", "dupla-final"].includes(fase.tipo) && pa === pb) {
    alert("No mata-mata, o placar precisa definir um vencedor. Registre o resultado após o desempate.");
    return;
  }
  const quadra = document.getElementById("quadraJogoModal").value;
  if (quadra && (!Number.isInteger(Number(quadra)) || Number(quadra) < 1 || Number(quadra) > obterQuantidadeQuadras())) {
    alert("Selecione uma quadra válida para este campeonato.");
    return;
  }
  aplicarQuadraJogo(jogoModalAtual, quadra);
  if (placarPreenchido) {
    jogoModalAtual.placarA = pa;
    jogoModalAtual.placarB = pb;
    delete jogoModalAtual.desistente;
    liberarQuadraJogo(jogoModalAtual);
    atualizarFasesConcluidas();
    avancarFasesAutomaticamente();
  }
  void salvarDados().then((salvo) => {
    if (salvo) sincronizarElegiveisInterclasse();
  });
  document.getElementById("modalPlacar").close();
  jogoModalAtual = null;
  renderizar();
}
function registrarDesistencia(lado) {
  if (!jogoModalAtual || !exigirOrganizador()) return;
  const equipeDesistente = lado === "A" ? jogoModalAtual.equipeA : jogoModalAtual.equipeB;
  if (!confirm(`Confirmar a desistência de ${equipeDesistente}?`)) return;
  jogoModalAtual.desistente = equipeDesistente;
  jogoModalAtual.placarA = lado === "A" ? 0 : 1;
  jogoModalAtual.placarB = lado === "A" ? 1 : 0;
  liberarQuadraJogo(jogoModalAtual);
  atualizarFasesConcluidas();
  avancarFasesAutomaticamente();
  void salvarDados().then((salvo) => {
    if (salvo) sincronizarElegiveisInterclasse();
  });
  document.getElementById("modalPlacar").close();
  jogoModalAtual = null;
  renderizar();
}
function renderizarFases() {
  let html = `<section class="bloco-fase"><h3>Fases da competição</h3>
    ${campeonato.fases.map((fase, i) =>
      `<p>${i + 1}. ${escapar(fase.nome)} — ${fase.concluida ? "Concluída" : "Em andamento"}</p>`
    ).join("")}</section>`;
  const faseGrupos = campeonato.fases.find((f) => f.tipo === "grupos");
  const faseMata = [...campeonato.fases].reverse().find((f) => f.tipo === "mata");
  if (faseGrupos && !faseMata) {
    html += `<section class="bloco-fase"><h3>Classificar para o mata-mata</h3>
      <p class="mensagem-info">Quando todos os jogos dos grupos tiverem resultados, os dois primeiros de cada grupo avançam.</p>
      <button class="botao" id="gerarMata">Gerar mata-mata</button></section>`;
  }
  if (faseMata && faseMata.concluida) {
    const vencedores = faseMata.jogos.map(vencedorDoJogo).filter(Boolean);
    if (vencedores.length === 1) {
      const jogoFinal = faseMata.jogos[0];
      const disputaTerceiro = campeonato.fases.find((fase) => fase.tipo === "terceiro");
      const terceiroLugar = disputaTerceiro && disputaTerceiro.concluida
        ? vencedorDoJogo(disputaTerceiro.jogos[0])
        : null;
      html += renderizarPodio(vencedores[0], perdedorDoJogo(jogoFinal), terceiroLugar);
    } else {
      html += `<section class="bloco-fase"><h3>Próxima rodada</h3>
        <button class="botao" id="gerarProximaRodada">Gerar próxima rodada</button></section>`;
    }
  } else if (faseMata) {
    html += `<section class="bloco-fase"><p class="mensagem-info">Os vencedores avançam automaticamente assim que cada partida termina.</p></section>`;
  }
  return html;
}
function configurarAbas() {
  const classificacao = document.querySelector('[data-aba="classificacao"]');
  const chaveamento = document.querySelector('[data-aba="chaveamento"]');
  const botaoSortearGrupos = document.getElementById("sortearGrupos");
  const botaoSortearMata = document.getElementById("sortearMata");
  botaoSortearGrupos.hidden = !ehOrganizador() || campeonato.formato !== "grupos";
  botaoSortearMata.hidden = !ehOrganizador() || campeonato.formato === "todos";
  if (campeonato.formato === "todos") {
    classificacao.textContent = "Tabela geral"; classificacao.hidden = false; chaveamento.hidden = true;
    if (abaAtual === "chaveamento") abaAtual = "classificacao";
  } else if (campeonato.formato === "grupos") {
    classificacao.textContent = "Grupos"; classificacao.hidden = false; chaveamento.hidden = false;
  } else {
    classificacao.hidden = true; chaveamento.hidden = false;
    if (abaAtual === "classificacao") abaAtual = "chaveamento";
  }
}
function renderizar() {
  if (!campeonato) return;
  configurarAbas();
  document.title = campeonato.nome + " | ARENA+";
  document.getElementById("tituloCampeonato").textContent = campeonato.nome;
  const quantidadeParticipantes = campeonato.inscricoesAbertas
    ? inscricoes.length
    : campeonato.participantes.length;
  document.getElementById("infoCampeonato").textContent =
    campeonato.modalidade + " • " + quantidadeParticipantes +
    (campeonato.inscricoesAbertas ? " duplas/equipes inscritas" : " participantes") +
    " • " + nomeFormato(campeonato.formato) + " • " +
    obterQuantidadeQuadras() + (obterQuantidadeQuadras() === 1 ? " quadra" : " quadras");
  document.getElementById("tituloGerenciamento").textContent =
    ehOrganizador() ? "Gerenciar campeonato" : "Tabela do campeonato";
  document.getElementById("integracaoInterclasse").hidden = !ehOrganizador();
  document.getElementById("iniciarCampeonato").hidden =
    !ehOrganizador() || !campeonato.inscricoesAbertas;
  document.getElementById("editarCampeonato").hidden = !ehOrganizador();
  document.getElementById("voltarRodada").hidden = !ehOrganizador();
  document.getElementById("desfazerCampeonato").hidden = !ehOrganizador();
  document.getElementById("conteudoInscricoes").closest(".painel-inscricoes").hidden = false;
  atualizarInscricoesNaTela();
  const conteudo = document.getElementById("conteudoCampeonato");
  if (abaAtual === "jogos") conteudo.innerHTML = renderizarJogosAba();
  else if (abaAtual === "classificacao") conteudo.innerHTML = renderizarClassificacao();
  else conteudo.innerHTML = renderizarChaveamento();

  conteudo.querySelectorAll("[data-salvar-jogo]").forEach((botao) => {
    botao.addEventListener("click", () => salvarPlacar(botao.dataset.salvarJogo));
  });
  conteudo.querySelectorAll("[data-quadra-jogo]").forEach((select) => {
    select.addEventListener("change", () => atualizarQuadraJogo(select.dataset.quadraJogo, select.value));
  });
  conteudo.querySelectorAll("[data-editar-jogo]").forEach((card) => {
    card.addEventListener("click", () => abrirModalPlacar(card.dataset.editarJogo));
    card.addEventListener("keydown", (evento) => {
      if (evento.key === "Enter" || evento.key === " ") {
        evento.preventDefault();
        abrirModalPlacar(card.dataset.editarJogo);
      }
    });
  });
  const gerarMata = document.getElementById("gerarMata");
  if (gerarMata) gerarMata.addEventListener("click", gerarMataMataDosGrupos);
  const proxima = document.getElementById("gerarProximaRodada");
  if (proxima) proxima.addEventListener("click", gerarProximaRodada);
  const avancarDupla = document.getElementById("avancarDupla");
  if (avancarDupla) avancarDupla.addEventListener("click", avancarEliminacaoDupla);
  document.querySelectorAll("[data-aba]").forEach((botao) => {
    botao.classList.toggle("ativa", botao.dataset.aba === abaAtual);
  });
}
document.querySelectorAll("[data-aba]").forEach((botao) => {
  botao.addEventListener("click", () => {
    abaAtual = botao.dataset.aba;
    renderizar();
  });
});
document.getElementById("formPlacar").addEventListener("submit", salvarPlacarModal);
document.getElementById("fecharModal").addEventListener("click", () => document.getElementById("modalPlacar").close());
document.getElementById("cancelarModal").addEventListener("click", () => document.getElementById("modalPlacar").close());
document.getElementById("desistenciaA").addEventListener("click", () => registrarDesistencia("A"));
document.getElementById("desistenciaB").addEventListener("click", () => registrarDesistencia("B"));
document.getElementById("desfazerCampeonato").addEventListener("click", desfazerCampeonato);
document.getElementById("iniciarCampeonato").addEventListener("click", () => void iniciarCampeonato());
document.getElementById("editarCampeonato").addEventListener("click", abrirEdicaoCampeonato);
document.getElementById("sortearGrupos").addEventListener("click", sortearGrupos);
document.getElementById("sortearMata").addEventListener("click", sortearMataMata);
document.getElementById("voltarRodada").addEventListener("click", voltarUmaRodada);
document.getElementById("formCampeonatoEdicao").addEventListener("submit", salvarEdicaoCampeonato);
document.getElementById("fecharEdicao").addEventListener("click", () => document.getElementById("modalCampeonato").close());
document.getElementById("cancelarEdicao").addEventListener("click", () => document.getElementById("modalCampeonato").close());
document.getElementById("conectarInterclasse").addEventListener("click", () => void conectarInterclasse());
document.getElementById("sincronizarInterclasse").addEventListener("click", sincronizarJogosInterclasse);
document.getElementById("recuperarPlacarApi").addEventListener("click", () => void recuperarPlacarInterclasse());
async function carregarCampeonatoDaConta({ user, championships: dados, error }) {
  campeonatos = !error ? dados : [];
  campeonato = campeonatos.find((item) => String(item.id) === String(idCampeonato)) || null;
  if (!campeonato) {
    document.getElementById("tituloCampeonato").textContent = error
      ? "Não foi possível carregar os campeonatos"
      : "Campeonato não encontrado";
    document.getElementById("infoCampeonato").textContent = error
      ? "Verifique a conexão com o Supabase."
      : "Confira o link ou volte ao início para escolher um campeonato.";
    document.getElementById("conteudoInscricoes").closest(".painel-inscricoes").hidden = true;
    document.getElementById("conteudoCampeonato").innerHTML =
      '<p class="mensagem-info">Este campeonato não está disponível.</p>';
    return;
  }
  const token = ++tokenCarregamentoInscricoes;
  try {
    inscricoes = await window.arenaStore.listRegistrations(campeonato.id);
  } catch (loadError) {
    if (token !== tokenCarregamentoInscricoes) return;
    inscricoes = [];
    window.arenaStore.showError(loadError);
  }
  if (token !== tokenCarregamentoInscricoes) return;
  if (!Array.isArray(campeonato.participantes)) campeonato.participantes = [];
  if (!Array.isArray(campeonato.fases)) campeonato.fases = [];
  if (!Number.isInteger(campeonato.quadras) || campeonato.quadras < 1) campeonato.quadras = 1;
  atualizarFasesConcluidas();
  renderizar();
}
window.arenaStore.onData(carregarCampeonatoDaConta);
window.arenaStore.ready.then(() => {
  void carregarCampeonatoDaConta({
    user: window.arenaStore.user,
    championships: carregarDados()
  });
});

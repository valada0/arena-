let campeonatos = [];

function carregarDados() {
  return window.arenaStore.championships;
}
async function salvarCampeonato(campeonato) {
  try {
    await window.arenaStore.save(campeonato);
    campeonatos = carregarDados();
    return true;
  } catch (error) {
    window.arenaStore.showError(error);
    return false;
  }
}
function gerarId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function todosJogosDoCampeonato(campeonato) {
  if (!campeonato || !Array.isArray(campeonato.fases)) return [];
  return campeonato.fases.flatMap((fase) => {
    if (fase && Array.isArray(fase.grupos)) {
      return fase.grupos.flatMap((grupo) => Array.isArray(grupo.jogos) ? grupo.jogos : []);
    }
    return Array.isArray(fase.jogos) ? fase.jogos : [];
  });
}
function jogoConcluidoNaHome(jogo) {
  if (!jogo || jogo.folga) return true;
  const placarA = Number(jogo.placarA);
  const placarB = Number(jogo.placarB);
  return jogo.placarA !== null && jogo.placarB !== null &&
    jogo.placarA !== "" && jogo.placarB !== "" &&
    Number.isFinite(placarA) && Number.isFinite(placarB) &&
    placarA >= 0 && placarB >= 0;
}
function campeonatoAoVivo(campeonato) {
  if (!campeonato || campeonato.inscricoesAbertas) return false;
  const jogos = todosJogosDoCampeonato(campeonato);
  if (!jogos.length || campeonatoConcluido(campeonato)) return false;
  return Array.isArray(campeonato.fases) && campeonato.fases.length > 0;
}
function campeonatoConcluido(campeonato) {
  const jogos = todosJogosDoCampeonato(campeonato);
  if (!jogos.length) return false;
  return jogos.every(jogoConcluidoNaHome);
}
function obterEmoji(modalidade) {
  const emojis = {
    "Futevôlei": "🏐", "Futebol": "⚽", "Futsal": "⚽",
    "Vôlei": "🏐", "Vôlei de praia": "🏖️", "Basquete": "🏀",
    "Tênis": "🎾", "Teqball": "🏓", "Outro": "🏆"
  };
  return emojis[modalidade] || "🏆";
}
function obterClasse(modalidade) {
  const classes = {
    "Futevôlei": "esporte-futevolei", "Futebol": "esporte-futebol",
    "Futsal": "esporte-futsal", "Vôlei": "esporte-volei",
    "Vôlei de praia": "esporte-volei-de-praia",
    "Basquete": "esporte-basquete", "Teqball": "esporte-teqball"
  };
  return classes[modalidade] || "";
}
function abrirCampeonato(id) {
  const url = "campeonato.html?id=" + encodeURIComponent(id);
  const janela = window.open(url, "_blank");
  if (!janela) alert("O navegador bloqueou a nova janela. Permita pop-ups para este site.");
}
function nomeFormato(formato) {
  if (formato === "mata") return "Mata-mata";
  if (formato === "dupla") return "Eliminação dupla";
  if (formato === "grupos") return "Grupos + mata-mata";
  return "Todos contra todos";
}
function renderizarDestaque() {
  const secao = document.getElementById("destaqueCampeonato");
  const campeonato = campeonatos[0];
  if (!campeonato) {
    secao.hidden = true;
    return;
  }
  secao.hidden = false;
  const capaDestaque = document.getElementById("capaDestaque");
  const aoVivo = campeonatoAoVivo(campeonato);
  capaDestaque.className = "capa-destaque " + obterClasse(campeonato.modalidade);
  if (aoVivo) capaDestaque.classList.add("destaque-ao-vivo");
  const statusDestaque = document.querySelector("#destaqueCampeonato .conteudo-destaque .etiqueta");
  if (statusDestaque) {
    statusDestaque.textContent = aoVivo ? "AO VIVO" : "EM DESTAQUE";
    statusDestaque.style.color = aoVivo ? "#ff5b5b" : "";
  }
  document.getElementById("tituloDestaque").textContent = campeonato.nome;
  document.getElementById("detalhesDestaque").textContent =
    campeonato.modalidade + " • " +
    (campeonato.inscricoesAbertas ? "Inscrições abertas" : campeonato.participantes.length + " participantes") +
    " • " + nomeFormato(campeonato.formato) + (aoVivo ? " • Ao vivo" : "");
  document.getElementById("abrirDestaque").onclick =
    () => abrirCampeonato(campeonato.id);
}
function renderizarListaCampeonatos() {
  const lista = document.getElementById("listaCampeonatos");
  const total = document.getElementById("totalCampeonatos");
  const vazio = document.getElementById("mensagemVazia");
  lista.replaceChildren();
  total.textContent = campeonatos.length +
    (campeonatos.length === 1 ? " campeonato" : " campeonatos");
  vazio.hidden = campeonatos.length > 0;
  vazio.textContent = "Ainda não há campeonatos. Crie o primeiro!";

  campeonatos.forEach((campeonato) => {
    const cartao = document.createElement("article");
    const aoVivo = campeonatoAoVivo(campeonato);
    cartao.className = "cartao-campeonato" + (aoVivo ? " cartao-ao-vivo" : "");

    const capa = document.createElement("div");
    capa.className = "capa-cartao " + obterClasse(campeonato.modalidade);
    capa.textContent = obterEmoji(campeonato.modalidade);
    capa.setAttribute("aria-hidden", "true");

    if (aoVivo) {
      const badge = document.createElement("span");
      badge.className = "badge-ao-vivo";
      badge.textContent = "Ao vivo";
      capa.appendChild(badge);
    }

    const info = document.createElement("div");
    info.className = "info-cartao";
    const titulo = document.createElement("h3");
    titulo.textContent = campeonato.nome;
    const detalhes = document.createElement("p");
    detalhes.textContent = campeonato.modalidade + " • " +
      (campeonato.inscricoesAbertas
        ? "Inscrições abertas"
        : campeonato.participantes.length + " participantes");

    const acoes = document.createElement("div");
    acoes.className = "acoes-cartao";
    const abrir = document.createElement("button");
    abrir.className = "botao-abrir";
    abrir.textContent = "▶ Abrir";
    abrir.addEventListener("click", () => abrirCampeonato(campeonato.id));

    acoes.append(abrir);
    if (window.arenaStore.user && campeonato.ownerId === window.arenaStore.user.id) {
      const excluir = document.createElement("button");
      excluir.className = "botao-excluir";
      excluir.textContent = "Excluir";
      excluir.addEventListener("click", () => excluirCampeonato(campeonato.id));
      acoes.append(excluir);
    }
    info.append(titulo, detalhes, acoes);
    cartao.append(capa, info);
    lista.appendChild(cartao);
  });
}
async function excluirCampeonato(id) {
  const campeonato = campeonatos.find((item) => item.id === id);
  if (!campeonato) return;
  if (!confirm('Tem certeza que deseja excluir "' + campeonato.nome + '"?')) return;
  try {
    await window.arenaStore.remove(id);
    campeonatos = carregarDados();
  } catch (error) {
    window.arenaStore.showError(error);
    return;
  }
  renderizarTudo();
}
function renderizarTudo() {
  renderizarDestaque();
  renderizarListaCampeonatos();
  const conectado = Boolean(window.arenaStore.user);
  document.getElementById("entrarParaCriar").hidden = conectado;
  document.querySelector("#formCampeonato button[type='submit']").hidden = !conectado;
}
document.getElementById("entrarParaCriar").addEventListener("click", () => window.arenaStore.openAuth());
document.getElementById("formCampeonato").addEventListener("submit", (evento) => {
  evento.preventDefault();
  if (!window.arenaStore.user) {
    window.arenaStore.openAuth();
    return;
  }
  const nome = document.getElementById("nomeCampeonato").value.trim();
  const modalidade = document.getElementById("modalidade").value;
  const formato = document.getElementById("formato").value;
  if (!nome || !modalidade) {
    alert("Preencha o nome e a modalidade.");
    return;
  }

  const novoCampeonato = {
    id: gerarId(), nome, modalidade, formato, participantes: [],
    inscricoesAbertas: true, quadras: 1,
    criadoEm: new Date().toISOString(), fases: [], jogos: []
  };
  void salvarCampeonato(novoCampeonato).then((salvo) => {
    if (!salvo) return;
    renderizarTudo();
    document.getElementById("formCampeonato").reset();
    document.getElementById("campeonatos").scrollIntoView({ behavior: "smooth" });
  });
});

window.arenaStore.onData(({ user, championships: dados, error }) => {
  campeonatos = user && !error ? dados : [];
  renderizarTudo();
});
window.arenaStore.ready.then(() => {
  campeonatos = carregarDados();
  renderizarTudo();
});

const CHAVE = "meu-campeonato-v1";
let campeonatos = carregarDados();

function carregarDados() {
  try {
    const dados = JSON.parse(localStorage.getItem(CHAVE) || "[]");
    return Array.isArray(dados) ? dados : [];
  } catch {
    return [];
  }
}
function salvarDados() {
  localStorage.setItem(CHAVE, JSON.stringify(campeonatos));
}
function gerarId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
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
  document.getElementById("tituloDestaque").textContent = campeonato.nome;
  document.getElementById("detalhesDestaque").textContent =
    campeonato.modalidade + " • " + campeonato.participantes.length +
    " participantes • " + nomeFormato(campeonato.formato);
  document.getElementById("capaDestaque").className =
    "capa-destaque " + obterClasse(campeonato.modalidade);
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

  campeonatos.forEach((campeonato) => {
    const cartao = document.createElement("article");
    cartao.className = "cartao-campeonato";

    const capa = document.createElement("div");
    capa.className = "capa-cartao " + obterClasse(campeonato.modalidade);
    capa.textContent = obterEmoji(campeonato.modalidade);
    capa.setAttribute("aria-hidden", "true");

    const info = document.createElement("div");
    info.className = "info-cartao";
    const titulo = document.createElement("h3");
    titulo.textContent = campeonato.nome;
    const detalhes = document.createElement("p");
    detalhes.textContent = campeonato.modalidade + " • " +
      campeonato.participantes.length + " participantes";

    const acoes = document.createElement("div");
    acoes.className = "acoes-cartao";
    const abrir = document.createElement("button");
    abrir.className = "botao-abrir";
    abrir.textContent = "▶ Abrir";
    abrir.addEventListener("click", () => abrirCampeonato(campeonato.id));

    const excluir = document.createElement("button");
    excluir.className = "botao-excluir";
    excluir.textContent = "Excluir";
    excluir.addEventListener("click", () => excluirCampeonato(campeonato.id));

    acoes.append(abrir, excluir);
    info.append(titulo, detalhes, acoes);
    cartao.append(capa, info);
    lista.appendChild(cartao);
  });
}
function excluirCampeonato(id) {
  const campeonato = campeonatos.find((item) => item.id === id);
  if (!campeonato) return;
  if (!confirm('Tem certeza que deseja excluir "' + campeonato.nome + '"?')) return;
  campeonatos = campeonatos.filter((item) => item.id !== id);
  salvarDados();
  renderizarTudo();
}
function renderizarTudo() {
  renderizarDestaque();
  renderizarListaCampeonatos();
}
document.getElementById("formCampeonato").addEventListener("submit", (evento) => {
  evento.preventDefault();
  const nome = document.getElementById("nomeCampeonato").value.trim();
  const modalidade = document.getElementById("modalidade").value;
  const formato = document.getElementById("formato").value;
  const participantes = document.getElementById("participantes").value
    .split("\n").map((nome) => nome.trim()).filter(Boolean);

  if (!nome || !modalidade) {
    alert("Preencha o nome e a modalidade.");
    return;
  }
  if (participantes.length < 2) {
    alert("Cadastre pelo menos 2 participantes.");
    return;
  }
  const nomesUnicos = new Set(participantes.map((nome) => nome.toLowerCase()));
  if (nomesUnicos.size !== participantes.length) {
    alert("Existem participantes com nomes repetidos. Confira a lista.");
    return;
  }
  if (formato === "grupos" && participantes.length < 4) {
    alert("Para usar grupos + mata-mata, cadastre pelo menos 4 participantes.");
    return;
  }

  campeonatos.unshift({
    id: gerarId(), nome, modalidade, formato, participantes,
    criadoEm: new Date().toISOString(), fases: [], jogos: []
  });
  salvarDados();
  renderizarTudo();
  document.getElementById("formCampeonato").reset();
  document.getElementById("campeonatos").scrollIntoView({ behavior: "smooth" });
});
renderizarTudo();

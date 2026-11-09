const CHAVE = "meu-campeonato-v1";
const USUARIOS_KEY = "arena-usuarios-v1";
const SESSAO_KEY = "arena-sessao-v1";

let campeonatos = carregarDados();
let usuarios = carregarUsuarios();
let usuarioAtual = carregarSessao();

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
function carregarUsuarios() {
  try {
    const dados = JSON.parse(localStorage.getItem(USUARIOS_KEY) || "[]");
    return Array.isArray(dados) ? dados : [];
  } catch {
    return [];
  }
}
function salvarUsuarios() {
  localStorage.setItem(USUARIOS_KEY, JSON.stringify(usuarios));
}
function carregarSessao() {
  try {
    const id = localStorage.getItem(SESSAO_KEY);
    if (!id) return null;
    const lista = carregarUsuarios();
    return lista.find((usuario) => usuario.id === id) || null;
  } catch {
    return null;
  }
}
function salvarSessao(usuario) {
  if (!usuario) {
    localStorage.removeItem(SESSAO_KEY);
    return;
  }
  localStorage.setItem(SESSAO_KEY, usuario.id);
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
  if (formato === "dupla") return "Eliminação dupla";
  if (formato === "grupos") return "Grupos + mata-mata";
  return "Todos contra todos";
}
function renderizarAuth() {
  const usuarioStatus = document.getElementById("usuarioStatus");
  const usuarioNome = document.getElementById("usuarioNomeLogado");
  const authAnonimo = document.getElementById("authAnonimo");
  const logoutBtn = document.getElementById("logoutBtn");

  if (!usuarioAtual) {
    usuarioStatus.hidden = true;
    authAnonimo.hidden = false;
    logoutBtn.hidden = true;
    return;
  }

  usuarioStatus.hidden = false;
  authAnonimo.hidden = true;
  logoutBtn.hidden = false;
  usuarioNome.textContent = usuarioAtual.nome;
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
  const marcador = campeonato.status === "ao-vivo" ? " • AO VIVO" : "";
  document.getElementById("detalhesDestaque").textContent =
    campeonato.modalidade + " • " + campeonato.participantes.length +
    " participantes • " + nomeFormato(campeonato.formato) + marcador;
  document.getElementById("capaDestaque").className =
    "capa-destaque " + obterClasse(campeonato.modalidade);
  document.getElementById("abrirDestaque").onclick = () => abrirCampeonato(campeonato.id);
}
function inscreverNoCampeonato(id) {
  if (!usuarioAtual) {
    alert("Para se inscrever em um campeonato, crie uma conta e faça login.");
    return;
  }

  const campeonato = campeonatos.find((item) => item.id === id);
  if (!campeonato) return;
  if (campeonato.status === "ao-vivo" || campeonato.status === "finalizado") {
    alert("Este campeonato já começou e não aceita mais inscrições.");
    return;
  }
  const jaInscrito = campeonato.inscritos?.some((inscrito) => inscrito.userId === usuarioAtual.id);
  if (jaInscrito) {
    alert("Você já está inscrito neste campeonato.");
    return;
  }

  campeonato.inscritos = campeonato.inscritos || [];
  campeonato.participantes = campeonato.participantes || [];
  if (campeonato.participantes.some((nome) => nome.toLocaleLowerCase() === usuarioAtual.nome.toLocaleLowerCase())) {
    alert("Já existe um participante com esse nome neste campeonato.");
    return;
  }
  campeonato.inscritos.push({ userId: usuarioAtual.id, nome: usuarioAtual.nome });

  if (!campeonato.participantes.includes(usuarioAtual.nome)) {
    campeonato.participantes.push(usuarioAtual.nome);
  }

  salvarDados();
  renderizarTudo();
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
    cartao.className = "cartao-campeonato" + (campeonato.status === "ao-vivo" ? " live" : "");

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

    const status = document.createElement("p");
    status.className = "status-cartao";
    status.textContent = campeonato.status === "ao-vivo" ? "AO VIVO" : campeonato.status === "finalizado" ? "Finalizado" : "Inscrições abertas";

    const acoes = document.createElement("div");
    acoes.className = "acoes-cartao";

    const abrir = document.createElement("button");
    abrir.className = "botao-abrir";
    abrir.textContent = "▶ Abrir";
    abrir.addEventListener("click", () => abrirCampeonato(campeonato.id));

    const botaoInscricao = document.createElement("button");
    botaoInscricao.className = "botao-inscricao";

    const jaInscrito = !!usuarioAtual && campeonato.inscritos?.some((inscrito) => inscrito.userId === usuarioAtual.id);

    if (!usuarioAtual) {
      botaoInscricao.textContent = "Faça login";
      botaoInscricao.disabled = true;
    } else if (jaInscrito) {
      botaoInscricao.textContent = "Inscrito";
      botaoInscricao.disabled = true;
    } else if (campeonato.status === "ao-vivo" || campeonato.status === "finalizado") {
      botaoInscricao.textContent = "Em andamento";
      botaoInscricao.disabled = true;
    } else {
      botaoInscricao.textContent = "Inscrever-se";
      botaoInscricao.addEventListener("click", () => inscreverNoCampeonato(campeonato.id));
    }

    const excluir = document.createElement("button");
    excluir.className = "botao-excluir";
    excluir.textContent = "Excluir";
    excluir.disabled = !(usuarioAtual && campeonato.criadorId === usuarioAtual.id);
    excluir.addEventListener("click", () => excluirCampeonato(campeonato.id));

    acoes.append(abrir, botaoInscricao);
    if (usuarioAtual && campeonato.criadorId === usuarioAtual.id) acoes.append(excluir);
    info.append(titulo, detalhes, status, acoes);
    cartao.append(capa, info);
    lista.appendChild(cartao);
  });
}
function excluirCampeonato(id) {
  const campeonato = campeonatos.find((item) => item.id === id);
  if (!campeonato) return;
  if (!usuarioAtual || campeonato.criadorId !== usuarioAtual.id) {
    alert("Somente o criador pode excluir este campeonato.");
    return;
  }
  if (!confirm('Tem certeza que deseja excluir "' + campeonato.nome + '"?')) return;
  campeonatos = campeonatos.filter((item) => item.id !== id);
  salvarDados();
  renderizarTudo();
}
function renderizarTudo() {
  renderizarAuth();
  renderizarDestaque();
  renderizarListaCampeonatos();
}
function validarConta() {
  if (!usuarioAtual) {
    alert("Você precisa criar uma conta para criar ou participar do campeonato.");
    return false;
  }
  return true;
}
function registrarUsuario(nome, email, senha) {
  const nomeFinal = nome.trim();
  const emailFinal = email.trim().toLowerCase();
  const senhaFinal = senha.trim();
  if (!nomeFinal || !emailFinal || !senhaFinal) {
    throw new Error("Preencha todos os campos.");
  }
  if (senhaFinal.length < 6) {
    throw new Error("A senha precisa ter pelo menos 6 caracteres.");
  }
  if (usuarios.some((usuario) => usuario.email === emailFinal)) {
    throw new Error("Este e-mail já está cadastrado.");
  }

  const novoUsuario = {
    id: gerarId(),
    nome: nomeFinal,
    email: emailFinal,
    senha: senhaFinal,
    criadoEm: new Date().toISOString()
  };

  usuarios.push(novoUsuario);
  salvarUsuarios();
  return novoUsuario;
}
function autenticarUsuario(email, senha) {
  const emailFinal = email.trim().toLowerCase();
  const senhaFinal = senha.trim();
  const usuario = usuarios.find((item) => item.email === emailFinal && item.senha === senhaFinal);
  if (!usuario) {
    throw new Error("E-mail ou senha inválidos.");
  }
  usuarioAtual = usuario;
  salvarSessao(usuario);
  renderizarTudo();
  return usuario;
}

document.getElementById("formCadastro").addEventListener("submit", (evento) => {
  evento.preventDefault();
  const nome = document.getElementById("cadastroNome").value;
  const email = document.getElementById("cadastroEmail").value;
  const senha = document.getElementById("cadastroSenha").value;

  try {
    const usuario = registrarUsuario(nome, email, senha);
    usuarioAtual = usuario;
    salvarSessao(usuario);
    document.getElementById("formCadastro").reset();
    renderizarTudo();
    alert("Conta criada com sucesso! Você já está logado.");
  } catch (erro) {
    alert(erro.message);
  }
});

document.getElementById("formLogin").addEventListener("submit", (evento) => {
  evento.preventDefault();
  const email = document.getElementById("loginEmail").value;
  const senha = document.getElementById("loginSenha").value;

  try {
    autenticarUsuario(email, senha);
    document.getElementById("formLogin").reset();
  } catch (erro) {
    alert(erro.message);
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  usuarioAtual = null;
  salvarSessao(null);
  renderizarTudo();
});

document.getElementById("formCampeonato").addEventListener("submit", (evento) => {
  evento.preventDefault();

  if (!validarConta()) return;

  const nome = document.getElementById("nomeCampeonato").value.trim();
  const modalidade = document.getElementById("modalidade").value;
  const formato = document.getElementById("formato").value;

  if (!nome || !modalidade) {
    alert("Preencha o nome e a modalidade.");
    return;
  }

  campeonatos.unshift({
    id: gerarId(),
    nome,
    modalidade,
    formato,
    participantes: [],
    criadorId: usuarioAtual.id,
    criadoEm: new Date().toISOString(),
    status: "rascunho",
    inscritos: [],
    fases: [],
    jogos: []
  });

  salvarDados();
  renderizarTudo();
  document.getElementById("formCampeonato").reset();
  document.getElementById("campeonatos").scrollIntoView({ behavior: "smooth" });
});
renderizarTudo();

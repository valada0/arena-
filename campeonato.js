const CHAVE = "meu-campeonato-v1";
const parametros = new URLSearchParams(window.location.search);
const idCampeonato = parametros.get("id");
let campeonatos = carregarDados();
let campeonato = campeonatos.find((item) => item.id === idCampeonato);
let abaAtual = "jogos";

function carregarDados() {
  try {
    const dados = JSON.parse(localStorage.getItem(CHAVE) || "[]");
    return Array.isArray(dados) ? dados : [];
  } catch { return []; }
}
function salvarDados() {
  localStorage.setItem(CHAVE, JSON.stringify(campeonatos));
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
function prepararCampeonato() {
  if (!campeonato) return;
  if (!Array.isArray(campeonato.fases)) campeonato.fases = [];
  if (campeonato.fases.length) return;

  if (campeonato.formato === "todos") {
    campeonato.fases.push({
      nome: "Todos contra todos", tipo: "liga",
      jogos: criarJogosTodosContraTodos(campeonato.participantes),
      concluida: false
    });
  } else if (campeonato.formato === "mata") {
    campeonato.fases.push(criarMataMata(campeonato.participantes));
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
  salvarDados();
}
function jogoConcluido(jogo) {
  return jogo.placarA !== null && jogo.placarB !== null &&
    jogo.placarA !== "" && jogo.placarB !== "" &&
    Number.isFinite(Number(jogo.placarA)) &&
    Number.isFinite(Number(jogo.placarB)) &&
    Number(jogo.placarA) >= 0 && Number(jogo.placarB) >= 0;
}
function vencedorDoJogo(jogo) {
  if (jogo.folga) return jogo.equipeA;
  if (!jogoConcluido(jogo)) return null;
  const a = Number(jogo.placarA), b = Number(jogo.placarB);
  if (a === b) return null;
  return a > b ? jogo.equipeA : jogo.equipeB;
}
function todosJogosConcluidos(jogos) {
  return jogos.every((jogo) => jogo.folga || jogoConcluido(jogo));
}
function todosOsJogos(fase) {
  return fase.tipo === "grupos" ? fase.grupos.flatMap((g) => g.jogos) : (fase.jogos || []);
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
    return `<article class="bloco-jogo">
      <div class="nome-equipe">${escapar(jogo.equipeA)}</div>
      <div class="placar">${jogo.folga ? "<strong>Folga</strong>" : `
        <input type="number" min="0" step="1" aria-label="Placar de ${escapar(jogo.equipeA)}"
          data-jogo="${jogo.id}" data-lado="A" value="${concluido ? jogo.placarA : ""}" placeholder="-">
        <span>:</span>
        <input type="number" min="0" step="1" aria-label="Placar de ${escapar(jogo.equipeB)}"
          data-jogo="${jogo.id}" data-lado="B" value="${concluido ? jogo.placarB : ""}" placeholder="-">
        <button class="botao-pequeno" data-salvar-jogo="${jogo.id}">Salvar</button>`}
      </div>
      <div class="nome-equipe">${jogo.equipeB ? escapar(jogo.equipeB) : "Avança automaticamente"}</div>
      ${concluido ? `<small>Resultado registrado${vencedorDoJogo(jogo) ? " • Vencedor: " + escapar(vencedorDoJogo(jogo)) : " • Empate"}</small>` : ""}
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
function gerarMataMataDosGrupos() {
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
  campeonato.fases.push(criarMataMata(classificados, "Mata-mata"));
  salvarDados(); renderizar();
}
function gerarProximaRodada() {
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
  salvarDados(); renderizar();
}
function salvarPlacar(idJogo) {
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
  if (fase && fase.tipo === "mata" && pa === pb) {
    alert("No mata-mata, o placar precisa definir um vencedor. Registre o resultado após o desempate.");
    return;
  }
  jogo.placarA = pa; jogo.placarB = pb;
  atualizarFasesConcluidas();
  salvarDados(); renderizar();
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
      html += `<section class="bloco-fase"><h3>🏆 Campeão</h3><p>${escapar(vencedores[0])}</p></section>`;
    } else {
      html += `<section class="bloco-fase"><h3>Próxima rodada</h3>
        <button class="botao" id="gerarProximaRodada">Gerar próxima rodada</button></section>`;
    }
  } else if (faseMata) {
    html += `<section class="bloco-fase"><p class="mensagem-info">Registre todos os placares da rodada para avançar.</p></section>`;
  }
  return html;
}
function renderizar() {
  if (!campeonato) return;
  document.title = campeonato.nome + " | ARENA+";
  document.getElementById("tituloCampeonato").textContent = campeonato.nome;
  document.getElementById("infoCampeonato").textContent =
    campeonato.modalidade + " • " + campeonato.participantes.length +
    " participantes • " + nomeFormato(campeonato.formato);
  const conteudo = document.getElementById("conteudoCampeonato");
  if (abaAtual === "jogos") conteudo.innerHTML = renderizarJogosAba();
  else if (abaAtual === "classificacao") conteudo.innerHTML = renderizarClassificacao();
  else conteudo.innerHTML = renderizarFases();

  conteudo.querySelectorAll("[data-salvar-jogo]").forEach((botao) => {
    botao.addEventListener("click", () => salvarPlacar(botao.dataset.salvarJogo));
  });
  const gerarMata = document.getElementById("gerarMata");
  if (gerarMata) gerarMata.addEventListener("click", gerarMataMataDosGrupos);
  const proxima = document.getElementById("gerarProximaRodada");
  if (proxima) proxima.addEventListener("click", gerarProximaRodada);
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
if (!campeonato) {
  document.getElementById("tituloCampeonato").textContent = "Campeonato não encontrado";
  document.getElementById("infoCampeonato").textContent =
    "Volte à página inicial e selecione um campeonato salvo.";
  document.getElementById("conteudoCampeonato").innerHTML =
    '<p class="mensagem-info">Não encontramos esse campeonato neste navegador.</p>';
} else {
  prepararCampeonato();
  atualizarFasesConcluidas();
  salvarDados();
  renderizar();
}

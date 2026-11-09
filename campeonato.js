const CHAVE = "meu-campeonato-v1";
const USUARIOS_KEY = "arena-usuarios-v1";
const SESSAO_KEY = "arena-sessao-v1";
const parametros = new URLSearchParams(window.location.search);
const idCampeonato = parametros.get("id");
let campeonatos = carregarDados();
let campeonato = campeonatos.find((item) => item.id === idCampeonato);
let usuarioAtual = carregarSessao();
let abaAtual = "jogos";
let jogoModalAtual = null;

function carregarDados() {
  try {
    const dados = JSON.parse(localStorage.getItem(CHAVE) || "[]");
    return Array.isArray(dados) ? dados : [];
  } catch { return []; }
}
function salvarDados() {
  localStorage.setItem(CHAVE, JSON.stringify(campeonatos));
}
function carregarSessao() {
  try {
    const id = localStorage.getItem(SESSAO_KEY);
    if (!id) return null;
    const usuarios = JSON.parse(localStorage.getItem(USUARIOS_KEY) || "[]");
    return Array.isArray(usuarios) ? usuarios.find((usuario) => usuario.id === id) || null : null;
  } catch {
    return null;
  }
}
function usuarioPodeEditar() {
  return !!usuarioAtual && !!campeonato && campeonato.criadorId === usuarioAtual.id;
}
function usuarioInscrito() {
  if (!usuarioAtual || !campeonato) return false;
  return campeonato.inscritos?.some((inscrito) => inscrito.userId === usuarioAtual.id) || false;
}
function campeonatoEmAndamento() {
  return !!campeonato && (campeonato.status === "ao-vivo" || campeonato.status === "finalizado");
}
function iniciarCampeonato() {
  if (!campeonato) return;
  if (!usuarioPodeEditar()) {
    alert("Somente o criador do campeonato pode iniciá-lo.");
    return;
  }
  if (campeonato.status === "ao-vivo") {
    alert("Este campeonato já está ao vivo.");
    return;
  }
  campeonato.participantes = campeonato.participantes || [];
  if (campeonato.participantes.length < 2) {
    alert("São necessários pelo menos 2 participantes inscritos para iniciar.");
    return;
  }
  if (campeonato.formato === "grupos" && campeonato.participantes.length < 4) {
    alert("O formato de grupos precisa de pelo menos 4 participantes inscritos.");
    return;
  }

  campeonato.status = "ao-vivo";
  if (!Array.isArray(campeonato.fases) || campeonato.fases.length === 0) {
    prepararCampeonato();
  }
  salvarDados();
  renderizar();
}
function desfazerCampeonato() {
  if (!campeonato) return;
  if (!usuarioPodeEditar()) {
    alert("Somente o criador pode desfazer o campeonato.");
    return;
  }
  const confirmar = confirm("Deseja desfazer o andamento deste campeonato? Todos os placares e fases geradas serão removidos.");
  if (!confirmar) return;
  campeonato.fases = [];
  campeonato.status = "rascunho";
  prepararCampeonato();
  atualizarFasesConcluidas();
  salvarDados();
  abaAtual = "jogos";
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
function criarFaseDupla(participantes, tipo, rodada, nome) {
  const jogos = [];
  for (let indice = 0; indice < participantes.length; indice += 2) {
    const equipeA = participantes[indice];
    const equipeB = participantes[indice + 1];
    if (!equipeA && !equipeB) continue;
    if (!equipeA || !equipeB) {
      const equipe = equipeA || equipeB;
      jogos.push({
        id: gerarId(), rodada, equipeA: equipe, equipeB: null,
        placarA: null, placarB: null, vencedor: equipe, folga: true
      });
      continue;
    }
    jogos.push({
      id: gerarId(), rodada, equipeA, equipeB,
      placarA: null, placarB: null
    });
  }
  return { nome, tipo, rodada, jogos, concluida: false };
}
function fasesDupla(tipo) {
  return campeonato.fases.filter((fase) => fase.tipo === tipo).sort((a, b) => a.rodada - b.rodada);
}
function confrontosDupla(participantes, tipo, rodada, nome) {
  if (!participantes.length) return null;
  return criarFaseDupla(participantes, tipo, rodada, nome);
}
function nomeRodadaDupla(tipo, rodada) {
  const descricao = tipo === "dupla-vencedores" ? "Chave dos vencedores" : "Chave dos perdedores";
  return `${descricao} - Rodada ${rodada}`;
}
function campeonatoDuplaProntoParaAvancar() {
  const fases = campeonato.fases.filter((fase) => fase.tipo.startsWith("dupla-"));
  return fases.length > 0 && fases.every((fase) => fase.concluida);
}
function avancarEliminacaoDupla() {
  if (!usuarioPodeEditar() || !campeonatoDuplaProntoParaAvancar()) return;

  const vencedores = fasesDupla("dupla-vencedores");
  const perdedores = fasesDupla("dupla-perdedores");
  const finais = fasesDupla("dupla-final");
  const totalRodadasVencedores = Math.ceil(Math.log2(campeonato.participantes.length));
  const totalRodadasPerdedores = 2 * (totalRodadasVencedores - 1);
  const ultimaVencedores = vencedores[vencedores.length - 1];
  const ultimaPerdedores = perdedores[perdedores.length - 1];

  if (finais.length) {
    const vencedorFinal = vencedorDoJogo(finais[finais.length - 1].jogos[0]);
    if (finais.length > 1 || vencedorFinal === vencedorDoJogo(ultimaVencedores.jogos[0])) {
      campeonato.status = "finalizado";
      salvarDados(); renderizar();
      return;
    }
    campeonato.fases.push(criarFaseDupla(
      [vencedorDoJogo(ultimaVencedores.jogos[0]), vencedorFinal],
      "dupla-final", 2, "Final de desempate"
    ));
    salvarDados(); renderizar();
    return;
  }

  if (ultimaVencedores.rodada < totalRodadasVencedores) {
    const rodada = ultimaVencedores.rodada;
    campeonato.fases.push(criarFaseDupla(
      ultimaVencedores.jogos.map(vencedorDoJogo).filter(Boolean),
      "dupla-vencedores", rodada + 1,
      nomeRodadaDupla("dupla-vencedores", rodada + 1)
    ));

    let timesPerdedores;
    if (rodada === 1) {
      timesPerdedores = ultimaVencedores.jogos.map(perdedorDoJogo).filter(Boolean);
    } else if (rodada % 2 === 0) {
      const rodadaOrigem = rodada / 2 + 1;
      const faseOrigem = vencedores.find((fase) => fase.rodada === rodadaOrigem);
      timesPerdedores = [
        ...ultimaPerdedores.jogos.map(vencedorDoJogo).filter(Boolean),
        ...faseOrigem.jogos.map(perdedorDoJogo).filter(Boolean)
      ];
    } else {
      timesPerdedores = ultimaPerdedores.jogos.map(vencedorDoJogo).filter(Boolean);
    }
    const fasePerdedores = confrontosDupla(
      timesPerdedores, "dupla-perdedores", rodada,
      nomeRodadaDupla("dupla-perdedores", rodada)
    );
    if (fasePerdedores) campeonato.fases.push(fasePerdedores);
  } else if (ultimaPerdedores && ultimaPerdedores.rodada < totalRodadasPerdedores) {
    const rodada = ultimaPerdedores.rodada + 1;
    let timesPerdedores;
    if (rodada % 2 === 0) {
      const rodadaOrigem = rodada / 2 + 1;
      const faseOrigem = vencedores.find((fase) => fase.rodada === rodadaOrigem);
      timesPerdedores = [
        ...ultimaPerdedores.jogos.map(vencedorDoJogo).filter(Boolean),
        ...faseOrigem.jogos.map(perdedorDoJogo).filter(Boolean)
      ];
    } else {
      timesPerdedores = ultimaPerdedores.jogos.map(vencedorDoJogo).filter(Boolean);
    }
    const fasePerdedores = confrontosDupla(
      timesPerdedores, "dupla-perdedores", rodada,
      nomeRodadaDupla("dupla-perdedores", rodada)
    );
    if (fasePerdedores) campeonato.fases.push(fasePerdedores);
  } else {
    const campeaoVencedores = vencedorDoJogo(ultimaVencedores.jogos[0]);
    const campeaoPerdedores = ultimaPerdedores
      ? vencedorDoJogo(ultimaPerdedores.jogos[0])
      : perdedorDoJogo(ultimaVencedores.jogos[0]);
    campeonato.fases.push(criarFaseDupla(
      [campeaoVencedores, campeaoPerdedores], "dupla-final", 1, "Grande final"
    ));
  }
  salvarDados(); renderizar();
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
  } else if (campeonato.formato === "dupla") {
    const participantes = embaralhar(campeonato.participantes);
    const tamanhoChave = 2 ** Math.ceil(Math.log2(participantes.length));
    while (participantes.length < tamanhoChave) participantes.push(null);
    campeonato.fases.push(criarFaseDupla(
      participantes, "dupla-vencedores", 1,
      nomeRodadaDupla("dupla-vencedores", 1)
    ));
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
function avancarRodadasDeJogos() {
  let avancou = false;
  campeonato.fases.forEach((fase) => {
    if (fase.tipo !== "grupos" && fase.tipo !== "liga") return;
    const jogos = todosOsJogos(fase);
    const rodadaAtual = Number(fase.rodadaAtual) || 1;
    const totalRodadas = Math.max(1, ...jogos.map((jogo) => Number(jogo.rodada) || 1));
    const jogosDaRodada = jogos.filter((jogo) => jogo.rodada === rodadaAtual);
    if (!fase.concluida && rodadaAtual < totalRodadas && jogosDaRodada.length &&
        todosJogosConcluidos(jogosDaRodada)) {
      fase.rodadaAtual = rodadaAtual + 1;
      avancou = true;
    }
  });
  return avancou;
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
function renderizarCampoQuadra(jogo) {
  if (usuarioPodeEditar()) {
    return `<div class="editor-quadra">
      <label for="quadra-${jogo.id}">Quadra</label>
      <input id="quadra-${jogo.id}" type="text" maxlength="40" data-quadra="${jogo.id}"
        value="${escapar(jogo.quadra || "")}" placeholder="Ex.: Quadra 1">
      <button class="botao-pequeno" type="button" data-salvar-quadra="${jogo.id}">Salvar quadra</button>
    </div>`;
  }
  return jogo.quadra
    ? `<p class="quadra-atribuida">Quadra: <strong>${escapar(jogo.quadra)}</strong></p>`
    : "";
}
function salvarQuadra(idJogo) {
  if (!usuarioPodeEditar()) return;
  const jogo = campeonato.fases.flatMap(todosOsJogos).find((item) => item.id === idJogo);
  const campo = document.querySelector(`[data-quadra="${idJogo}"]`);
  if (!jogo || !campo) return;
  const quadra = campo.value.trim();
  if (quadra) jogo.quadra = quadra;
  else delete jogo.quadra;
  salvarDados();
  renderizar();
}
function renderizarJogos(jogos) {
  if (!jogos.length) return '<p class="mensagem-info">Não há jogos nesta fase.</p>';
  const podeEditarJogo = usuarioPodeEditar();
  return `<div class="lista-jogos">${jogos.map((jogo) => {
    const concluido = jogoConcluido(jogo);
    const exibicaoA = jogo.folga ? "-" : concluido ? jogo.placarA : "-";
    const exibicaoB = jogo.folga ? "" : concluido ? jogo.placarB : "-";
    const placarHtml = jogo.folga
      ? "<strong>Folga</strong>"
      : podeEditarJogo
        ? `
        <input type="number" min="0" step="1" aria-label="Placar de ${escapar(jogo.equipeA)}"
          data-jogo="${jogo.id}" data-lado="A" value="${concluido ? jogo.placarA : ""}" placeholder="-">
        <span>:</span>
        <input type="number" min="0" step="1" aria-label="Placar de ${escapar(jogo.equipeB)}"
          data-jogo="${jogo.id}" data-lado="B" value="${concluido ? jogo.placarB : ""}" placeholder="-">
        <button class="botao-pequeno" data-salvar-jogo="${jogo.id}">Salvar</button>`
        : `<span>${exibicaoA}</span><span>:</span><span>${exibicaoB}</span>`;
    return `<article class="bloco-jogo">
      <div class="nome-equipe">${escapar(jogo.equipeA)}</div>
      <div class="placar">${placarHtml}</div>
      <div class="nome-equipe">${jogo.equipeB ? escapar(jogo.equipeB) : "Avança automaticamente"}</div>
      ${concluido ? `<small>Resultado registrado${vencedorDoJogo(jogo) ? " • Vencedor: " + escapar(vencedorDoJogo(jogo)) : " • Empate"}</small>` : ""}
      ${jogo.folga ? "" : renderizarCampoQuadra(jogo)}
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
  const resumo = renderizarFases();
  const fases = campeonato.fases.map((fase) => {
    if (fase.tipo === "grupos" || fase.tipo === "liga") {
      const rodadaAtual = fase.rodadaAtual || 1;
      const totalRodadas = Math.max(1, ...todosOsJogos(fase).map((jogo) => Number(jogo.rodada) || 1));
      const jogos = fase.tipo === "grupos"
        ? fase.grupos.map((grupo) => `<h4>${escapar(grupo.nome)}</h4>${renderizarJogos(grupo.jogos.filter((jogo) => jogo.rodada === rodadaAtual))}`).join("")
        : renderizarJogos(fase.jogos.filter((jogo) => jogo.rodada === rodadaAtual));
      return `<section class="bloco-fase"><h3>${escapar(fase.nome)} — Rodada ${rodadaAtual} de ${totalRodadas}</h3>${jogos}</section>`;
    }
    return `<section class="bloco-fase"><h3>${escapar(fase.nome)}</h3>${renderizarJogos(fase.jogos)}</section>`;
  }).join("");
  return `${resumo}${fases}`;
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
function renderizarChaveamento() {
  const fasesMata = campeonato.fases.filter((fase) => fase.tipo === "mata");
  const fasesChave = campeonato.formato === "dupla"
    ? campeonato.fases.filter((fase) => fase.tipo.startsWith("dupla-"))
    : [...fasesMata, ...campeonato.fases.filter((fase) => fase.tipo === "terceiro")];
  const faseGrupos = campeonato.fases.find((fase) => fase.tipo === "grupos");
  let html = "";
  if (faseGrupos && !fasesMata.length) html += `<section class="bloco-fase"><h3>Classificar para o mata-mata</h3><p class="mensagem-info">Quando todos os jogos dos grupos terminarem, os dois primeiros de cada grupo avançam automaticamente ao chaveamento.</p></section>`;
  if (fasesChave.length) {
    html += `<section class="bloco-chaveamento"><h3>${campeonato.formato === "dupla" ? "Chave dos vencedores e dos perdedores" : "Chaveamento eliminatório"}</h3><div class="chaveamento">${fasesChave.map((fase, indice) => `<div class="coluna-chave ${fase.tipo === "terceiro" ? "coluna-terceiro" : ""}"><h4>${escapar(campeonato.formato === "dupla" || fase.nome !== "Mata-mata" ? fase.nome : nomeRodada(indice))}</h4><div class="jogos-chave">${fase.jogos.map((jogo) => {
      const vencedor = vencedorDoJogo(jogo);
      const podeEditarJogo = usuarioPodeEditar();
      const atributoEditavel = podeEditarJogo && !jogo.folga ? `data-editar-jogo="${jogo.id}" tabindex="0" role="button" aria-label="Editar placar de ${escapar(jogo.equipeA)} contra ${escapar(jogo.equipeB)}"` : "";
      const classeEditavel = podeEditarJogo && !jogo.folga ? "editavel" : "";
      return `<div class="partida-chave-wrapper"><article class="partida-chave ${classeEditavel}" ${atributoEditavel}><div class="equipe-chave ${vencedor === jogo.equipeA ? "vencedora" : ""}"><span>${escapar(jogo.equipeA)}</span><strong>${jogo.folga ? "-" : jogoConcluido(jogo) ? jogo.placarA : "-"}</strong></div><div class="equipe-chave ${vencedor === jogo.equipeB ? "vencedora" : ""}"><span>${jogo.equipeB ? escapar(jogo.equipeB) : "Folga"}</span><strong>${jogo.folga ? "" : jogoConcluido(jogo) ? jogo.placarB : "-"}</strong></div><small>${jogo.folga ? "Avanço automático" : jogo.desistente ? "Vitória por desistência" : jogoConcluido(jogo) ? (podeEditarJogo ? "Clique para editar" : "Resultado registrado") : (podeEditarJogo ? "Clique para registrar o placar" : "Aguardando resultado")}</small></article>${jogo.folga ? "" : renderizarCampoQuadra(jogo)}</div>`;
    }).join("")}</div></div>`).join("")}</div></section>`;
    const ultima = fasesMata[fasesMata.length - 1];
    if (campeonato.formato === "dupla" && campeonato.status === "finalizado") {
      const faseFinal = fasesDupla("dupla-final").at(-1);
      html += `<section class="bloco-fase campeao"><h3>Campeão</h3><p>${escapar(vencedorDoJogo(faseFinal.jogos[0]))}</p></section>`;
    } else if (campeonato.formato !== "dupla" && usuarioPodeEditar() && ultima?.concluida) {
      const vencedores = ultima.jogos.map(vencedorDoJogo).filter(Boolean);
      html += vencedores.length === 1 ? `<section class="bloco-fase campeao"><h3>Campeão</h3><p>${escapar(vencedores[0])}</p></section>` : `<section class="bloco-fase"><h3>Próxima rodada</h3><p class="mensagem-info">A próxima rodada será gerada automaticamente.</p></section>`;
    }
  }
  return html || '<p class="mensagem-info">O chaveamento aparecerá quando a fase eliminatória for criada.</p>';
}
function gerarMataMataDosGrupos() {
  if (!usuarioPodeEditar()) return;
  const fase = campeonato.fases.find((f) => f.tipo === "grupos");
  if (!fase || !fase.concluida || campeonato.fases.some((f) => f.tipo === "mata")) return;
  const classificados = [];
  fase.grupos.forEach((grupo) => {
    const tabela = calcularClassificacao(grupo.participantes, grupo.jogos);
    if (tabela.length >= 2) classificados.push(tabela[0].nome, tabela[1].nome);
  });
  if (classificados.length < 2) {
    return;
  }
  campeonato.fases.push(criarMataMata(classificados, "Mata-mata"));
  salvarDados(); renderizar();
}
function gerarProximaRodada() {
  if (!usuarioPodeEditar()) return;
  const fase = [...campeonato.fases].reverse().find((f) => f.tipo === "mata");
  if (!fase || !fase.concluida) return;
  const vencedores = fase.jogos.map(vencedorDoJogo).filter(Boolean);
  if (vencedores.length === 1) {
    campeonato.status = "finalizado";
    salvarDados(); renderizar();
    return;
  }
  if (vencedores.length < 2) return;
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
function avancarRodadasAutomaticamente() {
  if (!usuarioPodeEditar() || campeonato.status !== "ao-vivo") {
    renderizar();
    return;
  }
  if (avancarRodadasDeJogos()) salvarDados();
  const faseGrupos = campeonato.fases.find((fase) => fase.tipo === "grupos");
  if (campeonato.formato === "dupla") {
    if (campeonatoDuplaProntoParaAvancar()) avancarEliminacaoDupla();
    else renderizar();
    return;
  }
  if (faseGrupos?.concluida && !campeonato.fases.some((fase) => fase.tipo === "mata")) {
    gerarMataMataDosGrupos();
    return;
  }
  const faseMata = [...campeonato.fases].reverse().find((fase) => fase.tipo === "mata");
  if (faseMata?.concluida) {
    gerarProximaRodada();
    return;
  }
  renderizar();
}
function salvarPlacar(idJogo) {
  if (!usuarioPodeEditar()) {
    alert("Somente o criador pode registrar placares.");
    return;
  }
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
  if (fase && (fase.tipo === "mata" || fase.tipo === "terceiro" || fase.tipo.startsWith("dupla-")) && pa === pb) {
    alert("No mata-mata, o placar precisa definir um vencedor. Registre o resultado após o desempate.");
    return;
  }
  jogo.placarA = pa; jogo.placarB = pb;
  delete jogo.desistente;
  atualizarFasesConcluidas();
  salvarDados(); avancarRodadasAutomaticamente();
}
function abrirModalPlacar(idJogo) {
  if (!usuarioPodeEditar()) {
    alert("Somente o criador pode editar o placar.");
    return;
  }
  const jogo = campeonato.fases.flatMap(todosOsJogos).find((item) => item.id === idJogo);
  if (!jogo || jogo.folga) return;
  jogoModalAtual = jogo;
  document.getElementById("equipeAModal").textContent = jogo.equipeA;
  document.getElementById("equipeBModal").textContent = jogo.equipeB;
  document.getElementById("confrontoModal").textContent = jogo.equipeA + " × " + jogo.equipeB;
  document.getElementById("placarAModal").value = jogoConcluido(jogo) ? jogo.placarA : "";
  document.getElementById("placarBModal").value = jogoConcluido(jogo) ? jogo.placarB : "";
  document.getElementById("desistenciaA").textContent = jogo.equipeA + " desistiu";
  document.getElementById("desistenciaB").textContent = jogo.equipeB + " desistiu";
  document.getElementById("modalPlacar").showModal();
}
function salvarPlacarModal(evento) {
  evento.preventDefault();
  if (!jogoModalAtual || !usuarioPodeEditar()) return;
  const inputA = document.getElementById("placarAModal");
  const inputB = document.getElementById("placarBModal");
  const pa = Number(inputA.value), pb = Number(inputB.value);
  if (!Number.isInteger(pa) || !Number.isInteger(pb) || pa < 0 || pb < 0) {
    alert("Digite dois placares válidos, usando números inteiros a partir de zero.");
    return;
  }
  if (pa === pb) {
    alert("No mata-mata, o placar precisa definir um vencedor. Registre o resultado após o desempate.");
    return;
  }
  jogoModalAtual.placarA = pa;
  jogoModalAtual.placarB = pb;
  delete jogoModalAtual.desistente;
  atualizarFasesConcluidas();
  salvarDados();
  document.getElementById("modalPlacar").close();
  jogoModalAtual = null;
  avancarRodadasAutomaticamente();
}
function registrarDesistencia(lado) {
  if (!jogoModalAtual || !usuarioPodeEditar()) return;
  const equipeDesistente = lado === "A" ? jogoModalAtual.equipeA : jogoModalAtual.equipeB;
  if (!confirm(`Confirmar a desistência de ${equipeDesistente}?`)) return;
  jogoModalAtual.desistente = equipeDesistente;
  jogoModalAtual.placarA = lado === "A" ? 0 : 1;
  jogoModalAtual.placarB = lado === "A" ? 1 : 0;
  atualizarFasesConcluidas();
  salvarDados();
  document.getElementById("modalPlacar").close();
  jogoModalAtual = null;
  avancarRodadasAutomaticamente();
}
function renderizarFases() {
  let html = `<section class="bloco-fase"><h3>Fases da competição</h3>
    ${campeonato.fases.map((fase, i) =>
      `<p>${i + 1}. ${escapar(fase.nome)} — ${fase.concluida ? "Concluída" : "Em andamento"}</p>`
    ).join("")}</section>`;
  const faseGrupos = campeonato.fases.find((f) => f.tipo === "grupos");
  const faseMata = [...campeonato.fases].reverse().find((f) => f.tipo === "mata");
  if (usuarioPodeEditar()) {
    if (campeonato.formato === "grupos" && faseGrupos && !faseMata) {
      html += `<section class="bloco-fase"><h3>Classificar para o mata-mata</h3>
        <p class="mensagem-info">O chaveamento será criado automaticamente quando todos os jogos dos grupos tiverem resultados.</p></section>`;
    }
    if (faseMata && faseMata.concluida) {
      const vencedores = faseMata.jogos.map(vencedorDoJogo).filter(Boolean);
      if (vencedores.length === 1) {
        html += `<section class="bloco-fase"><h3>🏆 Campeão</h3><p>${escapar(vencedores[0])}</p></section>`;
      } else {
        html += `<section class="bloco-fase"><h3>Próxima rodada</h3>
          <p class="mensagem-info">A próxima rodada será gerada automaticamente.</p></section>`;
      }
    } else if (faseMata) {
      html += `<section class="bloco-fase"><p class="mensagem-info">Registre todos os placares da rodada para avançar.</p></section>`;
    }
  }
  return html;
}
function configurarAbas() {
  const classificacao = document.querySelector('[data-aba="classificacao"]');
  const chaveamento = document.querySelector('[data-aba="chaveamento"]');
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
  document.getElementById("infoCampeonato").textContent =
    campeonato.modalidade + " • " + campeonato.participantes.length +
    " participantes • " + nomeFormato(campeonato.formato) + (campeonato.status === "ao-vivo" ? " • AO VIVO" : "");
  const statusBadge = document.getElementById("statusCampeonato");
  if (statusBadge) statusBadge.hidden = campeonato.status !== "ao-vivo";
  const iniciarBtn = document.getElementById("iniciarCampeonato");
  if (iniciarBtn) iniciarBtn.hidden = !(usuarioPodeEditar() && campeonato.status === "rascunho");
  const desfazerBtn = document.getElementById("desfazerCampeonato");
  if (desfazerBtn) desfazerBtn.hidden = !usuarioPodeEditar();

  const conteudo = document.getElementById("conteudoCampeonato");
  const restritoAntesDoInicio = !campeonatoEmAndamento() && !usuarioPodeEditar();

  if (restritoAntesDoInicio) {
    conteudo.innerHTML = '<p class="mensagem-info">Este campeonato ainda não foi iniciado pelo autor. Acompanhe a página no momento em que o criador clicar em iniciar.</p>';
    return;
  }

  if (abaAtual === "jogos") conteudo.innerHTML = renderizarJogosAba();
  else if (abaAtual === "classificacao") conteudo.innerHTML = renderizarClassificacao();
  else conteudo.innerHTML = renderizarChaveamento();

  conteudo.querySelectorAll("[data-salvar-jogo]").forEach((botao) => {
    botao.addEventListener("click", () => salvarPlacar(botao.dataset.salvarJogo));
  });
  conteudo.querySelectorAll("[data-salvar-quadra]").forEach((botao) => {
    botao.addEventListener("click", () => salvarQuadra(botao.dataset.salvarQuadra));
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
document.getElementById("iniciarCampeonato").addEventListener("click", iniciarCampeonato);

if (!campeonato) {
  document.getElementById("tituloCampeonato").textContent = "Campeonato não encontrado";
  document.getElementById("infoCampeonato").textContent =
    "Volte à página inicial e selecione um campeonato salvo.";
  document.getElementById("conteudoCampeonato").innerHTML =
    '<p class="mensagem-info">Não encontramos esse campeonato neste navegador.</p>';
} else {
  if (!campeonato.status) campeonato.status = "rascunho";
  if (!Array.isArray(campeonato.inscritos)) campeonato.inscritos = [];
  prepararCampeonato();
  atualizarFasesConcluidas();
  salvarDados();
  avancarRodadasAutomaticamente();
}

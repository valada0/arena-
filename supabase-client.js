(() => {
  const PROJECT_URL = "https://sfqbcyjwmymimxhijlut.supabase.co";
  const PUBLISHABLE_KEY = "sb_publishable_SkhHXsXvyjPSFowFtmZ-6w_pJVw_hiS";
  const LEGACY_KEY = "meu-campeonato-v1";
  const THEME_KEY = "arena-theme";
  const client = window.supabase.createClient(PROJECT_URL, PUBLISHABLE_KEY);
  const authEvents = new EventTarget();
  let currentUser = null;
  let isAdmin = false;
  let currentTheme = "dark";
  let championships = [];
  let readyResolve;
  let initialized = false;
  const ready = new Promise((resolve) => { readyResolve = resolve; });

  try {
    currentTheme = localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch (error) {
    console.error("Não foi possível carregar o tema salvo.", error);
  }
  document.documentElement.dataset.theme = currentTheme;

  const authContainer = document.createElement("div");
  authContainer.className = "auth-area";
  authContainer.innerHTML = `
    <button class="botao botao-config" id="abrirConfiguracoes" type="button">Configurações</button>
    <button class="botao botao-auth" id="abrirAuth" type="button">Entrar</button>
    <div class="auth-logado" id="authLogado" hidden>
      <span id="emailAuth"></span>
    </div>
  `;
  document.querySelector(".topo").append(authContainer);

  const modalAuth = document.createElement("dialog");
  modalAuth.className = "modal-placar modal-auth";
  modalAuth.innerHTML = `
    <form class="painel-modal" id="formAuth">
      <div class="cabecalho-modal">
        <div><span class="etiqueta-modal">ARENA+ NA NUVEM</span><h2>Acesse sua conta</h2></div>
        <button type="button" class="fechar-modal" id="fecharAuth" aria-label="Fechar">×</button>
      </div>
      <p class="mensagem-info">Entre para salvar e acessar seus campeonatos em qualquer dispositivo.</p>
      <label class="campo-edicao" for="emailAuthInput">E-mail
        <input id="emailAuthInput" type="email" autocomplete="email" required>
      </label>
      <label class="campo-edicao" for="senhaAuthInput">Senha
        <input id="senhaAuthInput" type="password" autocomplete="current-password" minlength="6" required>
      </label>
      <p class="auth-mensagem" id="mensagemAuth" role="status" aria-live="polite"></p>
      <div class="acoes-modal">
        <button type="button" class="aba" id="criarContaAuth">Criar conta</button>
        <button type="submit" class="botao" id="entrarAuth">Entrar</button>
      </div>
    </form>
  `;
  document.body.append(modalAuth);

  const settingsDialog = document.createElement("dialog");
  settingsDialog.className = "modal-placar modal-configuracoes";
  settingsDialog.setAttribute("aria-labelledby", "tituloConfiguracoes");
  settingsDialog.innerHTML = `
    <div class="painel-modal">
      <div class="cabecalho-modal">
        <div><span class="etiqueta-modal">ARENA+ NA NUVEM</span><h2 id="tituloConfiguracoes">Configurações</h2></div>
        <button type="button" class="fechar-modal" id="fecharConfiguracoes" aria-label="Fechar">×</button>
      </div>
      <section class="configuracoes-secao">
        <h3>Aparência</h3>
        <p>Escolha o tema deste navegador.</p>
        <button type="button" class="aba" id="alternarTema"></button>
      </section>
      <section class="configuracoes-secao">
        <h3>Conta</h3>
        <p id="infoContaConfiguracoes"></p>
        <button type="button" class="botao" id="entrarConfiguracoes" hidden>Entrar</button>
        <button type="button" class="botao-sair" id="sairConfiguracoes" hidden>Sair da conta</button>
      </section>
      <section class="configuracoes-secao">
        <h3>Acesso de administrador</h3>
        <p id="estadoAdminConfiguracoes" role="status"></p>
        <form id="formCodigoAdmin" hidden>
          <label class="campo-edicao" for="codigoAdmin">Código de convite
            <input id="codigoAdmin" type="password" autocomplete="one-time-code"
              minlength="20" maxlength="128" required>
          </label>
          <button type="submit" class="botao" id="ativarAdmin">Ativar administrador</button>
          <p class="auth-mensagem" id="mensagemCodigoAdmin" role="status" aria-live="polite"></p>
        </form>
      </section>
    </div>
  `;
  document.body.append(settingsDialog);

  function dispararDadosCarregados(error = null) {
    authEvents.dispatchEvent(new CustomEvent("data", {
      detail: { user: currentUser, isAdmin, championships: [...championships], error }
    }));
  }

  function lerCampeonatosLegados() {
    try {
      const data = JSON.parse(localStorage.getItem(LEGACY_KEY) || "[]");
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error("Não foi possível ler os campeonatos locais anteriores.", error);
      return [];
    }
  }

  async function importarDadosLegados() {
    if (!currentUser || !isAdmin) return;
    const existentes = new Set(championships.map((item) => String(item.id)));
    const antigos = lerCampeonatosLegados()
      .filter((item) => !existentes.has(String(item.id)));
    if (!antigos.length) return;
    const importar = confirm(
      `Encontramos ${antigos.length} campeonato(s) ainda não importados neste navegador. ` +
      `Deseja importá-los para a conta ${currentUser.email}?`
    );
    if (!importar) return;
    const rows = antigos.map((data) => ({
      id: String(data.id),
      user_id: currentUser.id,
      data,
      updated_at: new Date().toISOString()
    }));
    const { error } = await client.from("championships").upsert(rows);
    if (error) throw error;
    championships = [...antigos, ...championships];
  }

  async function carregarCampeonatos() {
    isAdmin = false;
    if (currentUser) {
      const { data: admin, error: adminError } = await client
        .from("site_admins")
        .select("user_id")
        .eq("user_id", currentUser.id)
        .maybeSingle();
      if (adminError) throw adminError;
      isAdmin = Boolean(admin);
    }

    const { data, error } = await client
      .from("championships")
      .select("id,user_id,data")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    championships = (data || []).map((row) => ({
      ...row.data,
      ownerId: row.user_id
    }));
    if (isAdmin) await importarDadosLegados();
    dispararDadosCarregados();
  }

  function atualizarInterfaceAuth() {
    const abrir = authContainer.querySelector("#abrirAuth");
    const logado = authContainer.querySelector("#authLogado");
    abrir.hidden = Boolean(currentUser);
    logado.hidden = !currentUser;
    authContainer.querySelector("#emailAuth").textContent = currentUser ? currentUser.email : "";
    atualizarConfiguracoes();
  }

  function atualizarConfiguracoes() {
    const conectado = Boolean(currentUser);
    settingsDialog.querySelector("#infoContaConfiguracoes").textContent = currentUser
      ? `Conectado como ${currentUser.email}.`
      : "Você não está conectado.";
    settingsDialog.querySelector("#entrarConfiguracoes").hidden = conectado;
    settingsDialog.querySelector("#sairConfiguracoes").hidden = !conectado;
    settingsDialog.querySelector("#formCodigoAdmin").hidden = !conectado || isAdmin;
    settingsDialog.querySelector("#estadoAdminConfiguracoes").textContent = isAdmin
      ? "Sua conta já é administradora."
      : conectado
        ? "Insira um código de convite de uso único para se tornar administrador."
        : "Entre na sua conta para usar um código de convite.";
    const alternarTema = settingsDialog.querySelector("#alternarTema");
    alternarTema.textContent = currentTheme === "light" ? "Usar tema escuro" : "Usar tema claro";
    alternarTema.setAttribute("aria-pressed", String(currentTheme === "light"));
  }

  function definirTema(theme) {
    currentTheme = theme;
    document.documentElement.dataset.theme = theme;
    atualizarConfiguracoes();
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (error) {
      console.error("Não foi possível salvar o tema escolhido.", error);
      throw error;
    }
  }

  async function sincronizarSessao(session) {
    currentUser = session && session.user ? session.user : null;
    atualizarInterfaceAuth();
    try {
      await carregarCampeonatos();
      if (!initialized) {
        initialized = true;
        readyResolve();
      }
    } catch (error) {
      isAdmin = false;
      championships = [];
      dispararDadosCarregados(error);
      if (!initialized) {
        initialized = true;
        readyResolve();
      }
      mostrarErro(error);
    }
  }

  function mostrarErro(error) {
    const mensagem = error && error.message ? error.message : String(error);
    authContainer.dataset.error = mensagem;
    console.error("Erro ao sincronizar com Supabase:", error);
    alert("Não foi possível sincronizar com o Supabase. " + mensagem);
  }

  async function salvarCampeonato(data) {
    if (!currentUser) throw new Error("Entre na sua conta para salvar campeonatos.");
    const alreadyExists = championships.some((item) => String(item.id) === String(data.id));
    if (!isAdmin && !alreadyExists) {
      throw new Error("Somente administradores podem criar campeonatos.");
    }
    if (data.ownerId && data.ownerId !== currentUser.id) {
      throw new Error("Somente o organizador pode editar este campeonato.");
    }
    const championshipData = { ...data };
    delete championshipData.ownerId;
    const { error } = await client.from("championships").upsert({
      id: String(data.id),
      user_id: currentUser.id,
      data: championshipData,
      updated_at: new Date().toISOString()
    });
    if (error) throw error;
    const index = championships.findIndex((item) => item.id === data.id);
    const savedChampionship = { ...championshipData, ownerId: currentUser.id };
    if (index < 0) championships.unshift(savedChampionship);
    else championships[index] = savedChampionship;
  }

  async function excluirCampeonato(id) {
    if (!currentUser) throw new Error("Entre na sua conta para excluir campeonatos.");
    const { error } = await client.from("championships").delete()
      .eq("id", String(id)).eq("user_id", currentUser.id);
    if (error) throw error;
    championships = championships.filter((item) => String(item.id) !== String(id));
    dispararDadosCarregados();
  }

  async function entrar(email, password) {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await sincronizarSessao(data.session);
    return data;
  }

  async function criarConta(email, password) {
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) throw error;
    if (data.session) await sincronizarSessao(data.session);
    return data;
  }

  async function sair() {
    const { error } = await client.auth.signOut();
    if (error) throw error;
    await sincronizarSessao(null);
  }

  async function reivindicarAdmin(code) {
    if (!currentUser) throw new Error("Entre na sua conta antes de usar um código de administrador.");
    const { data, error } = await client.rpc("claim_site_admin", { p_code: code });
    if (error) throw error;
    if (typeof data !== "boolean") {
      throw new Error("A função de convite respondeu em um formato inesperado.");
    }
    if (data) {
      isAdmin = true;
      dispararDadosCarregados();
    }
    atualizarConfiguracoes();
    return data;
  }

  async function listarInscricoes(championshipId) {
    const { data, error } = await client
      .from("championship_registrations")
      .select("id,user_id,team_name,created_at")
      .eq("championship_id", String(championshipId))
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function inscrever(championshipId, teamName) {
    if (!currentUser) throw new Error("Entre na sua conta para se inscrever.");
    const { error } = await client.from("championship_registrations").insert({
      championship_id: String(championshipId),
      user_id: currentUser.id,
      team_name: teamName
    });
    if (error) throw error;
  }

  async function removerInscricao(registrationId) {
    if (!currentUser) throw new Error("Entre na sua conta para alterar inscrições.");
    const { error } = await client.from("championship_registrations")
      .delete().eq("id", String(registrationId));
    if (error) throw error;
  }

  authContainer.querySelector("#abrirAuth").addEventListener("click", () => {
    modalAuth.querySelector("#mensagemAuth").textContent = "";
    modalAuth.showModal();
  });
  authContainer.querySelector("#abrirConfiguracoes").addEventListener("click", () => {
    atualizarConfiguracoes();
    settingsDialog.showModal();
  });
  settingsDialog.querySelector("#fecharConfiguracoes").addEventListener("click", () => settingsDialog.close());
  settingsDialog.querySelector("#alternarTema").addEventListener("click", () => {
    try {
      definirTema(currentTheme === "light" ? "dark" : "light");
    } catch (error) {
      mostrarErro(error);
    }
  });
  settingsDialog.querySelector("#entrarConfiguracoes").addEventListener("click", () => {
    settingsDialog.close();
    modalAuth.querySelector("#mensagemAuth").textContent = "";
    modalAuth.showModal();
  });
  settingsDialog.querySelector("#sairConfiguracoes").addEventListener("click", async () => {
    try {
      await sair();
    } catch (error) {
      mostrarErro(error);
    }
  });
  settingsDialog.querySelector("#formCodigoAdmin").addEventListener("submit", async (event) => {
    event.preventDefault();
    const codeInput = settingsDialog.querySelector("#codigoAdmin");
    const submit = settingsDialog.querySelector("#ativarAdmin");
    const message = settingsDialog.querySelector("#mensagemCodigoAdmin");
    submit.disabled = true;
    message.textContent = "Verificando o código...";
    try {
      const becameAdmin = await reivindicarAdmin(codeInput.value.trim());
      codeInput.value = "";
      message.textContent = becameAdmin
        ? "Acesso de administrador ativado."
        : "Sua conta já era administradora.";
    } catch (error) {
      message.textContent = error.message || "Não foi possível validar o código.";
    } finally {
      submit.disabled = false;
    }
  });
  modalAuth.querySelector("#fecharAuth").addEventListener("click", () => modalAuth.close());
  modalAuth.querySelector("#formAuth").addEventListener("submit", async (event) => {
    event.preventDefault();
    const mensagem = modalAuth.querySelector("#mensagemAuth");
    const submit = modalAuth.querySelector("#entrarAuth");
    submit.disabled = true;
    mensagem.textContent = "Conectando...";
    try {
      await entrar(
        modalAuth.querySelector("#emailAuthInput").value.trim(),
        modalAuth.querySelector("#senhaAuthInput").value
      );
      modalAuth.close();
    } catch (error) {
      mensagem.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });
  modalAuth.querySelector("#criarContaAuth").addEventListener("click", async () => {
    const mensagem = modalAuth.querySelector("#mensagemAuth");
    const button = modalAuth.querySelector("#criarContaAuth");
    button.disabled = true;
    mensagem.textContent = "Criando conta...";
    try {
      const data = await criarConta(
        modalAuth.querySelector("#emailAuthInput").value.trim(),
        modalAuth.querySelector("#senhaAuthInput").value
      );
      mensagem.textContent = data.session
        ? "Conta criada e conectada."
        : "Conta criada. Confirme seu e-mail antes de entrar.";
    } catch (error) {
      mensagem.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
  client.auth.onAuthStateChange((_event, session) => {
    if (!initialized) return;
    setTimeout(() => { void sincronizarSessao(session); }, 0);
  });

  const store = {
    client,
    ready,
    get user() { return currentUser; },
    get isAdmin() { return isAdmin; },
    get championships() { return [...championships]; },
    onData(callback) {
      const listener = (event) => callback(event.detail);
      authEvents.addEventListener("data", listener);
      return () => authEvents.removeEventListener("data", listener);
    },
    save: salvarCampeonato,
    remove: excluirCampeonato,
    claimAdmin: reivindicarAdmin,
    listRegistrations: listarInscricoes,
    register: inscrever,
    removeRegistration: removerInscricao,
    openAuth() {
      modalAuth.querySelector("#mensagemAuth").textContent = "";
      modalAuth.showModal();
    },
    showError: mostrarErro
  };
  window.arenaStore = store;

  client.auth.getSession().then(({ data, error }) => {
    if (error) throw error;
    return sincronizarSessao(data.session);
  }).catch((error) => {
    mostrarErro(error);
    if (!initialized) {
      initialized = true;
      readyResolve();
    }
  });
})();

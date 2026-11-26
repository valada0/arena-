import { createClient } from "npm:@supabase/supabase-js@2";

const API_BASE_URL = "https://rvarjao.pythonanywhere.com/api";
const LINK_TABLE = "interclasse_match_links";
const DEFAULT_APP_ORIGIN = "https://valada0.github.io";

type JsonRecord = Record<string, unknown>;

function jsonResponse(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json",
      "Vary": "Origin"
    }
  });
}

function apiResponse(response: Response, body: string, origin: string) {
  return new Response(body, {
    status: response.status,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": response.headers.get("Content-Type") || "application/json",
      "Vary": "Origin"
    }
  });
}

function errorResponse(message: string, status: number, origin: string) {
  return jsonResponse({ error: message }, status, origin);
}

function modalityForApi(value: unknown): string {
  const normalized = String(value || "").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const aliases: Record<string, string> = {
    "volei de praia": "volei",
    "volei": "volei",
    "futevolei": "futevolei",
    "futebol": "futebol",
    "futsal": "futsal",
    "basquete": "basquete",
    "tenis": "tenis",
    "teqball": "teqball"
  };
  return aliases[normalized] || normalized.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function allGames(championship: JsonRecord): JsonRecord[] {
  const phases = Array.isArray(championship.fases) ? championship.fases : [];
  return phases.flatMap((phase: JsonRecord) => {
    if (Array.isArray(phase.grupos)) {
      return phase.grupos.flatMap((group: JsonRecord) =>
        Array.isArray(group.jogos) ? group.jogos : []
      );
    }
    return Array.isArray(phase.jogos) ? phase.jogos : [];
  });
}

function idIsValid(value: unknown): value is string | number {
  return (typeof value === "string" || typeof value === "number") &&
    /^[a-zA-Z0-9_-]+$/.test(String(value));
}

function apiPayload(championship: JsonRecord, game: JsonRecord) {
  const teamA = String(game.equipeA || "").trim();
  const teamB = String(game.equipeB || "").trim();
  const modality = modalityForApi(championship.modalidade);
  if (!teamA || !teamB || !modality || game.folga) {
    throw new Error("A partida local não possui equipes e modalidade válidas.");
  }
  return {
    nome_equipe_a: teamA,
    nome_equipe_b: teamB,
    modalidade: modality
  };
}

async function callApi(
  token: string,
  path: string,
  method = "GET",
  body?: JsonRecord
): Promise<{ response: Response; text: string; data: JsonRecord | JsonRecord[] | null }> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  const options: RequestInit = {
    method,
    headers,
    signal: AbortSignal.timeout(20_000)
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`${API_BASE_URL}${path}`, options);
  const text = await response.text();
  let data: JsonRecord | JsonRecord[] | null = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  return { response, text, data };
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Falha inesperada na função.";
}

Deno.serve(async (request: Request) => {
  const configuredOrigin = new URL(Deno.env.get("APP_ORIGIN") || DEFAULT_APP_ORIGIN).origin;
  const requestOrigin = request.headers.get("Origin") || "";
  if (requestOrigin !== configuredOrigin) {
    return new Response("Origin not allowed.", { status: 403 });
  }
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": configuredOrigin,
        "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Vary": "Origin"
      }
    });
  }
  if (request.method !== "POST") {
    return errorResponse("Use POST para chamar esta função.", 405, configuredOrigin);
  }

  const apiToken = Deno.env.get("INTERCLASSE_API_TOKEN");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!apiToken || !supabaseUrl || !supabaseAnonKey) {
    return errorResponse("A função não está configurada com os segredos necessários.", 500, configuredOrigin);
  }

  let input: JsonRecord;
  try {
    input = await request.json();
  } catch {
    return errorResponse("Corpo JSON inválido.", 400, configuredOrigin);
  }

  const championshipId = String(input.championshipId || "");
  const action = String(input.acao || "");
  if (!championshipId || championshipId.length > 100) {
    return errorResponse("ID de campeonato inválido.", 400, configuredOrigin);
  }

  // Consultas de teste são públicas, limitadas ao campeonato e ao ID já publicados.
  if (action === "check" || action === "peek") {
    const publicClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: publicRow, error: publicError } = await publicClient
      .from("championships")
      .select("data")
      .eq("id", championshipId)
      .maybeSingle();
    if (publicError) return errorResponse("Não foi possível validar o campeonato.", 500, configuredOrigin);
    if (!publicRow) return errorResponse("Campeonato não encontrado.", 404, configuredOrigin);

    if (action === "peek") {
      const publicGameId = String(input.gameId || "");
      const publicScoreId = String(input.scoreId || "");
      const publicGame = allGames(publicRow.data as JsonRecord)
        .find((candidate) => String(candidate.id) === publicGameId);
      if (!publicGame || !idIsValid(publicScoreId) ||
          String(publicGame.interclasseId || "") !== publicScoreId) {
        return errorResponse("Placar não vinculado a esta partida.", 404, configuredOrigin);
      }
      let remote;
      try {
        remote = await callApi(apiToken, `/placares/${encodeURIComponent(publicScoreId)}`);
      } catch {
        return errorResponse("Falha de rede ao consultar a API centralizada.", 503, configuredOrigin);
      }
      if (!remote.response.ok) return errorResponse("Não foi possível consultar o placar.", remote.response.status, configuredOrigin);
      const data = remote.data as JsonRecord | null;
      let expected;
      try {
        expected = apiPayload(publicRow.data as JsonRecord, publicGame);
      } catch {
        return errorResponse("A partida publicada não possui equipes válidas.", 400, configuredOrigin);
      }
      if (!data || String(data.nome_equipe_a || "").trim() !== expected.nome_equipe_a ||
          String(data.nome_equipe_b || "").trim() !== expected.nome_equipe_b ||
          String(data.modalidade || "").trim() !== expected.modalidade) {
        return errorResponse("O placar remoto não corresponde à partida.", 409, configuredOrigin);
      }
      return jsonResponse({
        pontos_a: data.pontos_a,
        pontos_b: data.pontos_b,
        status: data.status,
        tempo_partida: data.tempo_partida
      }, 200, configuredOrigin);
    }

    try {
      const result = await callApi(apiToken, "/placares");
      if (!result.response.ok) return errorResponse("A API centralizada recusou a consulta.", result.response.status, configuredOrigin);
      return jsonResponse({ conectado: true }, 200, configuredOrigin);
    } catch {
      return errorResponse("Falha de rede ao conectar à API centralizada.", 503, configuredOrigin);
    }
  }

  if (action === "testSync" || action === "testGet") {
    const testChampionshipId = Deno.env.get("TEST_CHAMPIONSHIP_ID");
    const testCodeHash = Deno.env.get("TEST_SCORE_CODE_HASH")?.toLowerCase();
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!testChampionshipId || !testCodeHash || !serviceRoleKey) {
      return errorResponse("O envio de teste não está configurado.", 503, configuredOrigin);
    }
    if (championshipId !== testChampionshipId || !/^[0-9a-f]{64}$/.test(testCodeHash)) {
      return errorResponse("Campeonato de teste não autorizado.", 403, configuredOrigin);
    }
    const testCode = String(input.testCode || "");
    if (testCode.length < 16 || testCode.length > 128) {
      return errorResponse("Código de teste inválido.", 403, configuredOrigin);
    }
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(testCode)));
    const suppliedHash = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
    if (suppliedHash !== testCodeHash) {
      return errorResponse("Código de teste inválido.", 403, configuredOrigin);
    }
    const gameId = String(input.gameId || "");
    const pointsA = input.pontos_a;
    const pointsB = input.pontos_b;
    if (!idIsValid(gameId) || (action === "testSync" &&
        (!Number.isInteger(pointsA) || !Number.isInteger(pointsB) ||
          Number(pointsA) < 0 || Number(pointsB) < 0))) {
      return errorResponse("Partida ou placar de teste inválido.", 400, configuredOrigin);
    }
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: testRow, error: testRowError } = await serviceClient
      .from("championships")
      .select("user_id,data")
      .eq("id", championshipId)
      .maybeSingle();
    if (testRowError || !testRow) return errorResponse("Campeonato de teste não encontrado.", 404, configuredOrigin);
    const testGame = allGames(testRow.data as JsonRecord)
      .find((candidate) => String(candidate.id) === gameId);
    if (!testGame) return errorResponse("Partida não publicada neste campeonato.", 404, configuredOrigin);
    let payload;
    try {
      payload = apiPayload(testRow.data as JsonRecord, testGame);
    } catch {
      return errorResponse("A partida não possui equipes válidas.", 400, configuredOrigin);
    }
    if (String(input.nomeEquipeA || "").trim() !== payload.nome_equipe_a ||
        String(input.nomeEquipeB || "").trim() !== payload.nome_equipe_b) {
      return errorResponse("As equipes do teste diferem da partida publicada.", 409, configuredOrigin);
    }
    const linkQuery = () => serviceClient.from(LINK_TABLE)
      .select("api_score_id,creation_state")
      .eq("championship_id", championshipId)
      .eq("game_id", gameId)
      .maybeSingle();
    const { data: link, error: linkError } = await linkQuery();
    if (linkError) return errorResponse("Não foi possível verificar o vínculo da partida.", 500, configuredOrigin);
    if (link && !link.api_score_id) {
      return errorResponse("Há uma criação pendente para esta partida. Confira a API antes de repetir.", 409, configuredOrigin);
    }
    let scoreId = link?.api_score_id || (idIsValid(testGame.interclasseId) ? String(testGame.interclasseId) : "");
    if (action === "testGet" && !scoreId) {
      return errorResponse("Esta partida ainda não tem placar na API.", 404, configuredOrigin);
    }
    if (scoreId) {
      let remote;
      try {
        remote = await callApi(apiToken, `/placares/${encodeURIComponent(scoreId)}`);
      } catch {
        return errorResponse("Falha ao conferir o placar existente na API.", 503, configuredOrigin);
      }
      const remoteData = remote.data as JsonRecord | null;
      if (!remote.response.ok || !remoteData ||
          String(remoteData.nome_equipe_a || "").trim() !== payload.nome_equipe_a ||
          String(remoteData.nome_equipe_b || "").trim() !== payload.nome_equipe_b ||
          String(remoteData.modalidade || "").trim() !== payload.modalidade) {
        return errorResponse("O vínculo não corresponde à partida publicada.", 409, configuredOrigin);
      }
      if (action === "testGet") {
        return jsonResponse({
          id: scoreId,
          pontos_a: remoteData.pontos_a,
          pontos_b: remoteData.pontos_b,
          status: remoteData.status,
          tempo_partida: remoteData.tempo_partida
        }, 200, configuredOrigin);
      }
    } else {
      const { error: reserveError } = await serviceClient.from(LINK_TABLE).insert({
        championship_id: championshipId,
        game_id: gameId,
        user_id: testRow.user_id,
        creation_state: "creating"
      });
      if (reserveError) return errorResponse("Outra sessão iniciou a criação. Confira a API antes de repetir.", 409, configuredOrigin);
      let created;
      try {
        created = await callApi(apiToken, "/placares/criar", "POST", payload);
      } catch {
        await serviceClient.from(LINK_TABLE).update({ creation_state: "ambiguous" })
          .eq("championship_id", championshipId).eq("game_id", gameId);
        return errorResponse("Criação sem confirmação. Confira a API antes de repetir.", 503, configuredOrigin);
      }
      if (!created.response.ok || !created.data || !idIsValid((created.data as JsonRecord).id)) {
        await serviceClient.from(LINK_TABLE).update({
          creation_state: created.response.status >= 500 ? "ambiguous" : "failed"
        }).eq("championship_id", championshipId).eq("game_id", gameId);
        return errorResponse("Não foi possível confirmar a criação do placar.", 502, configuredOrigin);
      }
      scoreId = String((created.data as JsonRecord).id);
      const { error: saveLinkError } = await serviceClient.from(LINK_TABLE).update({
        api_score_id: scoreId,
        creation_state: "created"
      }).eq("championship_id", championshipId).eq("game_id", gameId);
      if (saveLinkError) return errorResponse("Placar criado, mas o vínculo não foi salvo. Confira a API antes de repetir.", 500, configuredOrigin);
    }
    let updated;
    try {
      updated = await callApi(apiToken, `/placares/${encodeURIComponent(scoreId)}`, "PATCH", {
        pontos_a: pointsA,
        pontos_b: pointsB,
        status: "encerrado"
      });
    } catch {
      return errorResponse("Falha ao enviar o placar. Verifique a API antes de repetir.", 503, configuredOrigin);
    }
    if (!updated.response.ok) return errorResponse("A API recusou o placar de teste.", updated.response.status, configuredOrigin);
    return jsonResponse({ id: scoreId, pontos_a: pointsA, pontos_b: pointsB, status: "encerrado" }, 200, configuredOrigin);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization) return errorResponse("Autenticação Supabase necessária.", 401, configuredOrigin);
  const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) return errorResponse("Token de sessão Supabase inválido.", 401, configuredOrigin);

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: userResult, error: authError } = await supabase.auth.getUser(accessToken);
  const user = userResult && userResult.user;
  if (authError || !user) return errorResponse("Sessão Supabase inválida ou expirada.", 401, configuredOrigin);

  const { data: championshipRow, error: championshipError } = await supabase
    .from("championships")
    .select("id,user_id,data")
    .eq("id", championshipId)
    .maybeSingle();
  if (championshipError) return errorResponse("Não foi possível validar o campeonato.", 500, configuredOrigin);
  if (!championshipRow) return errorResponse("Campeonato não encontrado.", 404, configuredOrigin);
  if (championshipRow.user_id !== user.id) {
    return errorResponse("Somente o organizador pode usar a integração deste campeonato.", 403, configuredOrigin);
  }

  const championship = championshipRow.data as JsonRecord;
  const gameId = input.gameId === undefined ? "" : String(input.gameId);
  const game = gameId
    ? allGames(championship).find((candidate) => String(candidate.id) === gameId)
    : undefined;
  if (gameId && !game) return errorResponse("Partida não encontrada neste campeonato.", 404, configuredOrigin);

  const fetchApi = async (path: string, method = "GET", body?: JsonRecord) => {
    try {
      const result = await callApi(apiToken, path, method, body);
      return result;
    } catch {
      return null;
    }
  };

  if (action === "listCandidates") {
    if (!game) return errorResponse("Informe uma partida local válida.", 400, configuredOrigin);
    const result = await fetchApi("/placares");
    if (!result) return errorResponse("Falha de rede ao consultar a API centralizada.", 503, configuredOrigin);
    if (!result.response.ok) return apiResponse(result.response, result.text, configuredOrigin);
    const list = Array.isArray(result.data)
      ? result.data
      : result.data && Array.isArray((result.data as JsonRecord).placares)
        ? (result.data as JsonRecord).placares as JsonRecord[]
        : null;
    if (!list) return errorResponse("A API não retornou uma lista reconhecida.", 502, configuredOrigin);
    const payload = apiPayload(championship, game);
    const candidates = list.filter((score: JsonRecord) =>
      String(score.nome_equipe_a || "").trim() === payload.nome_equipe_a &&
      String(score.nome_equipe_b || "").trim() === payload.nome_equipe_b &&
      String(score.modalidade || "").trim() === payload.modalidade
    );
    return jsonResponse(candidates, 200, configuredOrigin);
  }

  if (!game) return errorResponse("Informe uma partida local válida.", 400, configuredOrigin);
  const payload = apiPayload(championship, game);
  const linkQuery = () => supabase.from(LINK_TABLE)
    .select("championship_id,game_id,user_id,api_score_id,creation_state,updated_at")
    .eq("championship_id", championshipId)
    .eq("game_id", gameId)
    .maybeSingle();

  if (action === "create") {
    if (game.interclasseCriacaoPendente !== true) {
      return errorResponse("Salve a reserva local da partida antes de criar o placar.", 409, configuredOrigin);
    }
    if (game.interclasseId) {
      return errorResponse("Esta partida já possui um ID. Consulte-o em vez de criar outro.", 409, configuredOrigin);
    }
    const { data: existing, error: readError } = await linkQuery();
    if (readError) return errorResponse("Não foi possível verificar a reserva desta partida.", 500, configuredOrigin);
    if (existing && existing.api_score_id) {
      const replay = await fetchApi(`/placares/${encodeURIComponent(existing.api_score_id)}`);
      if (!replay) return errorResponse("Falha de rede ao recuperar o placar já criado.", 503, configuredOrigin);
      return apiResponse(replay.response, replay.text, configuredOrigin);
    }
    const staleReservation = existing?.creation_state === "creating" &&
      Date.now() - new Date(existing.updated_at).getTime() >= 120_000;
    if (existing?.creation_state === "creating" &&
        !(staleReservation && input.confirmarAusencia === true)) {
      return errorResponse("Já existe uma criação em andamento para esta partida.", 409, configuredOrigin);
    }
    if (existing?.creation_state === "ambiguous" && input.confirmarAusencia !== true) {
      return errorResponse("Verifique a criação pendente antes de tentar novamente.", 409, configuredOrigin);
    }
    if (existing && !["ambiguous", "failed"].includes(existing.creation_state) && !staleReservation) {
      return errorResponse("A partida já tem uma tentativa reservada.", 409, configuredOrigin);
    }

    if (existing) {
      const { data: claimed, error: claimError } = await supabase.from(LINK_TABLE)
        .update({ creation_state: "creating", updated_at: new Date().toISOString() })
        .eq("championship_id", championshipId)
        .eq("game_id", gameId)
        .eq("creation_state", existing.creation_state)
        .eq("updated_at", existing.updated_at)
        .select("game_id")
        .maybeSingle();
      if (claimError || !claimed) return errorResponse("A tentativa já foi retomada em outra sessão.", 409, configuredOrigin);
    } else {
      const { error: insertError } = await supabase.from(LINK_TABLE).insert({
        championship_id: championshipId,
        game_id: gameId,
        user_id: user.id,
        creation_state: "creating"
      });
      if (insertError) return errorResponse("Já existe uma tentativa para esta partida; verifique antes de repetir.", 409, configuredOrigin);
    }

    let created;
    try {
      created = await callApi(apiToken, "/placares/criar", "POST", payload);
    } catch {
      await supabase.from(LINK_TABLE).update({
        creation_state: "ambiguous",
        updated_at: new Date().toISOString()
      }).eq("championship_id", championshipId).eq("game_id", gameId);
      return errorResponse("Falha de rede após iniciar a criação. Verifique a lista e o monitor antes de tentar novamente.", 503, configuredOrigin);
    }
    if (!created.response.ok) {
      await supabase.from(LINK_TABLE).update({
        creation_state: created.response.status >= 500 ? "ambiguous" : "failed",
        updated_at: new Date().toISOString()
      }).eq("championship_id", championshipId).eq("game_id", gameId);
      return apiResponse(created.response, created.text, configuredOrigin);
    }
    const createdData = created.data as JsonRecord | null;
    if (!createdData || !idIsValid(createdData.id)) {
      await supabase.from(LINK_TABLE).update({
        creation_state: "ambiguous",
        updated_at: new Date().toISOString()
      }).eq("championship_id", championshipId).eq("game_id", gameId);
      return errorResponse("Resposta de criação sem ID válido; verifique antes de repetir.", 502, configuredOrigin);
    }
    const { error: saveLinkError } = await supabase.from(LINK_TABLE).update({
      api_score_id: String(createdData.id),
      creation_state: "created",
      updated_at: new Date().toISOString()
    }).eq("championship_id", championshipId).eq("game_id", gameId);
    if (saveLinkError) {
      console.error("Could not persist Interclasse match link.");
    }
    return apiResponse(created.response, created.text, configuredOrigin);
  }

  const scoreId = input.scoreId;
  if (!idIsValid(scoreId)) return errorResponse("ID de placar inválido.", 400, configuredOrigin);
  if (action !== "associate" && String(game.interclasseId || "") !== String(scoreId)) {
    return errorResponse("O ID não está associado a esta partida local.", 403, configuredOrigin);
  }
  if (action === "associate" && game.interclasseId &&
      String(game.interclasseId) !== String(scoreId)) {
    return errorResponse("A partida já está associada a outro ID.", 409, configuredOrigin);
  }
  let { data: link, error: linkError } = await linkQuery();
  if (linkError) return errorResponse("Não foi possível validar o ID da partida.", 500, configuredOrigin);
  if (link && link.api_score_id && link.api_score_id !== String(scoreId)) {
    return errorResponse("O ID não pertence ao vínculo desta partida.", 403, configuredOrigin);
  }

  if (action === "associate") {
    const remote = await fetchApi(`/placares/${encodeURIComponent(String(scoreId))}`);
    if (!remote) return errorResponse("Falha de rede ao verificar o placar candidato.", 503, configuredOrigin);
    if (!remote.response.ok) return apiResponse(remote.response, remote.text, configuredOrigin);
    const remoteData = remote.data as JsonRecord | null;
    if (!remoteData ||
        String(remoteData.nome_equipe_a || "").trim() !== payload.nome_equipe_a ||
        String(remoteData.nome_equipe_b || "").trim() !== payload.nome_equipe_b ||
        String(remoteData.modalidade || "").trim() !== payload.modalidade) {
      return errorResponse("O placar candidato não corresponde às equipes e modalidade locais.", 409, configuredOrigin);
    }
    if (link && link.api_score_id && link.api_score_id !== String(scoreId)) {
      return errorResponse("Esta partida já tem outro ID associado.", 409, configuredOrigin);
    }
    const row = {
      championship_id: championshipId,
      game_id: gameId,
      user_id: user.id,
      api_score_id: String(scoreId),
      creation_state: "created",
      updated_at: new Date().toISOString()
    };
    const saved = link
      ? await supabase.from(LINK_TABLE).update(row).eq("championship_id", championshipId).eq("game_id", gameId)
      : await supabase.from(LINK_TABLE).insert(row);
    if (saved.error) return errorResponse("Não foi possível registrar o vínculo do ID.", 409, configuredOrigin);
    return jsonResponse(remoteData, 200, configuredOrigin);
  }

  if (link && !link.api_score_id) {
    const { error: saveLinkError } = await supabase.from(LINK_TABLE).update({
      api_score_id: String(scoreId),
      creation_state: "created",
      updated_at: new Date().toISOString()
    }).eq("championship_id", championshipId).eq("game_id", gameId);
    if (saveLinkError) return errorResponse("Não foi possível completar o vínculo do ID.", 409, configuredOrigin);
    link = { ...link, api_score_id: String(scoreId), creation_state: "created" };
  }

  if (action === "get") {
    const remote = await fetchApi(`/placares/${encodeURIComponent(String(scoreId))}`);
    if (!remote) return errorResponse("Falha de rede ao consultar a API centralizada.", 503, configuredOrigin);
    if (!link) {
      const remoteData = remote.data as JsonRecord | null;
      if (!remote.response.ok || !remoteData ||
          String(remoteData.nome_equipe_a || "").trim() !== payload.nome_equipe_a ||
          String(remoteData.nome_equipe_b || "").trim() !== payload.nome_equipe_b ||
          String(remoteData.modalidade || "").trim() !== payload.modalidade) {
        return errorResponse("O ID não corresponde à partida local.", 403, configuredOrigin);
      }
      const { error: saveLinkError } = await supabase.from(LINK_TABLE).insert({
        championship_id: championshipId,
        game_id: gameId,
        user_id: user.id,
        api_score_id: String(scoreId),
        creation_state: "created"
      });
      if (saveLinkError) return errorResponse("Não foi possível registrar o vínculo do ID.", 409, configuredOrigin);
    }
    return apiResponse(remote.response, remote.text, configuredOrigin);
  }

  if (action === "patch") {
    if (!link) {
      const remote = await fetchApi(`/placares/${encodeURIComponent(String(scoreId))}`);
      if (!remote) return errorResponse("Falha de rede ao validar o ID da partida.", 503, configuredOrigin);
      const remoteData = remote.data as JsonRecord | null;
      if (!remote.response.ok || !remoteData ||
          String(remoteData.nome_equipe_a || "").trim() !== payload.nome_equipe_a ||
          String(remoteData.nome_equipe_b || "").trim() !== payload.nome_equipe_b ||
          String(remoteData.modalidade || "").trim() !== payload.modalidade) {
        return errorResponse("O ID não corresponde à partida local.", 403, configuredOrigin);
      }
      const { error: saveLinkError } = await supabase.from(LINK_TABLE).insert({
        championship_id: championshipId,
        game_id: gameId,
        user_id: user.id,
        api_score_id: String(scoreId),
        creation_state: "created"
      });
      if (saveLinkError) return errorResponse("Não foi possível registrar o vínculo do ID.", 409, configuredOrigin);
    } else if (link.api_score_id !== String(scoreId)) {
      return errorResponse("O ID não está vinculado a esta partida.", 403, configuredOrigin);
    }
    const fields = input.fields as JsonRecord;
    const allowed = new Set(["pontos_a", "pontos_b", "status", "tempo_partida"]);
    if (!fields || typeof fields !== "object" || Array.isArray(fields) ||
        !Object.keys(fields).length || Object.keys(fields).some((key) => !allowed.has(key))) {
      return errorResponse("PATCH aceita apenas pontos_a, pontos_b, status e tempo_partida.", 400, configuredOrigin);
    }
    for (const key of ["pontos_a", "pontos_b", "tempo_partida"]) {
      if (key in fields && (!Number.isInteger(fields[key]) || Number(fields[key]) < 0)) {
        return errorResponse(`${key} deve ser um inteiro não negativo.`, 400, configuredOrigin);
      }
    }
    if ("status" in fields && !["aguardando", "em_andamento", "encerrado"].includes(String(fields.status))) {
      return errorResponse("Status inválido.", 400, configuredOrigin);
    }
    const remote = await fetchApi(
      `/placares/${encodeURIComponent(String(scoreId))}`,
      "PATCH",
      fields
    );
    if (!remote) return errorResponse("Falha de rede ao atualizar a API centralizada.", 503, configuredOrigin);
    return apiResponse(remote.response, remote.text, configuredOrigin);
  }

  return errorResponse("Ação não suportada.", 400, configuredOrigin);
});

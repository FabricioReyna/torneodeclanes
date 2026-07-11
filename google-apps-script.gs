function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents || "{}");
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

    var votesSheet = spreadsheet.getSheetByName("Votos");
    if (!votesSheet) {
      votesSheet = spreadsheet.insertSheet("Votos");
    }

    var rankingSheet = spreadsheet.getSheetByName("Ranking");
    if (!rankingSheet) {
      rankingSheet = spreadsheet.insertSheet("Ranking");
    }

    var votes = Array.isArray(data.votes) ? data.votes : [];
    var ranking = Array.isArray(data.ranking) ? data.ranking : [];

    votesSheet.clearContents();
    votesSheet.getRange(1, 1, 1, 4).setValues([["fecha", "juez", "clan", "score"]]);
    if (votes.length > 0) {
      var voteRows = votes.map(function (v) {
        return [v.fecha || "", v.juez || "", v.clan || "", Number(v.score || 0)];
      });
      votesSheet.getRange(2, 1, voteRows.length, 4).setValues(voteRows);
    }

    rankingSheet.clearContents();
    rankingSheet
      .getRange(1, 1, 1, 6)
      .setValues([["posicion", "clan", "tag", "totalPuntos", "promedio", "votos"]]);

    if (ranking.length > 0) {
      var rankingRows = ranking.map(function (r) {
        return [
          Number(r.posicion || 0),
          r.clan || "",
          r.tag || "",
          Number(r.totalPuntos || 0),
          Number(r.promedio || 0),
          Number(r.votos || 0)
        ];
      });
      rankingSheet.getRange(2, 1, rankingRows.length, 6).setValues(rankingRows);
    }

    var out = {
      ok: true,
      updatedAt: new Date().toISOString(),
      sheetUrl: spreadsheet.getUrl()
    };

    return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: String(error) })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

// Copyright 2016 Marc-Antoine Ruel. All rights reserved.
// Use of this source code is governed under the Apache License, Version 2.0
// that can be found in the LICENSE file.
//
//
// Please see https://github.com/maruel/market_track/ for up to date information!
//
//
// On Google Sheets templates, it is impossible to "sync" a spreadsheet an updated template
// version. Yet, this project is constantly being improved. This is why it is important
// to  replace the content of this file with the updated version at
// https://github.com/maruel/market_track/blob/master/code.gs
//
//
// References:
// https://support.google.com/docs/answer/3093281
// https://support.google.com/docs/table/25273?hl=en
// https://developers.google.com/apps-script/reference/base/logger
// https://developers.google.com/apps-script/reference/spreadsheet/range
// https://developers.google.com/apps-script/reference/spreadsheet/sheet
// https://developers.google.com/apps-script/reference/spreadsheet/embedded-chart-builder
//
// Canadian taxes:
// http://www.cra-arc.gc.ca/tx/ndvdls/tpcs/ncm-tx/rtrn/cmpltng/rprtng-ncm/lns101-170/127/gns/clclt/nclsn-eng.html
// http://www.cra-arc.gc.ca/E/pub/tg/t4037/t4037-e.html
//
//
// TODO(maruel):
// - Fill dividend via a third party service.
// - Fill stock name and description via a third party service (or web page scraping).
// - Use the currency when formatting the lines based on B1, e.g. £ for GBP, € for EUR, etc.
// - Have this script warn the user when a new version of this script is live.
//   This needs to include an easy way to turn the check off and explanation
//   about using multiple files for user scripts.
// - Do not get all values in createStockSheetChart() but only the ranges needed for performance.
// - Add netassets, eps, etc. See https://support.google.com/docs/answer/3093281.
// - Protect header cells that should not be modified.
// - Clear up "Assert Type". It mixes different things; it could be a MutualFund of Stocks
//   or ETF of Bonds.
// - Figure out a way to fill "Asset Type" more accurately. Automatically filing "Weight"
//   is probably a lost cause. Many ETF do not report the number of shares so use this as
//   a poor proxy to know if it is an ETF.
// - Technically TSE: is not an official prefix for the TSX but that's what Google
//   finance uses.
// - Handle stock gift in ACB calculation in CALCULATE_ACB().
// - ACB deduction is painful to calculate when using old capital losses.
// - Use ENSURE_TRACKED() to automate the sheet further.
//


// Exposed functions usable in the sheet.


/**
 * Returns a link to Google Finance.
 *
 * @param {ticker} ticker of a stock.
 * @return URL to Google Finance.
 * @customfunction
 */
function GET_GFINANCE_LINK(ticker) {
  if (ticker) {
    // Directs to the Canadian site. Change as desired.
    return "https://www.google.ca/finance?q=" + ticker;
  }
  return "";
}

/**
 * Returns a link to Morning Star.
 *
 * @param {ticker} ticker of a stock.
 * @param {currency} currency in which the security is traded in.
 * @return URL to Morning Star.
 * @customfunction
 */
function GET_MORNINGSTAR_LINK(ticker, currency) {
  if (ticker) {
    var parts = ticker.split(":");
    if (parts[0] != "CURRENCY") {
      // Directs to the Canadian site. Change as desired.
      if (currency == "CAD") {
        return "https://quote.morningstar.ca/quicktakes/etf/etf_ca.aspx?region=CAN&culture=en-CA&t=" + parts[1];
      } else {
        return "https://quote.morningstar.ca/quicktakes/etf/etf_ca.aspx?region=USA&culture=en-CA&t=" + parts[1];
      }
    }
    // Add more currency as desired.
  }
  return "";
}

/**
 * Returns a link to Yahoo Finance.
 *
 * @param {ticker} ticker of a stock.
 * @return URL to Yahoo Finance.
 * @customfunction
 */
function GET_YFINANCE_LINK(ticker) {
  if (ticker) {
    var parts = ticker.split(":");
    if (parts[0] != "CURRENCY") {
      if (parts[0] == "TSE") {
        parts[1] = parts[1] + ".TO";
      }
      // Directs to the Canadian site. Change as desired.
      // range can be 1d, 5d, 1m, 3m, 6m, 1y, 5y.
      //return "https://ca.finance.yahoo.com/charts?s=" + name + "#symbol=" + name + ";range=my";
      return "https://ca.finance.yahoo.com/echarts?s=" + parts[1] + "#symbol=" + parts[1] + ";range=my";
    }
  }
  return "";
}

/**
 * Returns all the accounts.
 *
 * @return sorted list of accounts as a vertical list.
 * @customfunction
 */
function ACCOUNTS() {
  var values = [];
  var sheets = SpreadsheetApp.getActive().getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    if (sheet.getRange("A1").getValue() == accountSheetHeaderRows[0][0]) {
      values.push(sheet.getName());
    }
  }
  values.sort();
  var out = [];
  for (var i in values) {
    out.push([values[i]]);
  }
  if (out.length == 0) {
    return null;
  }
  return out;
}

/**
 * Returns the list of tracked securities as a vertical list.
 * Ignores the currency exchange tabs.
 *
 * @return sorted list of tracked securities as a vertical list.
 * @customfunction
 */
function TRACKED_STOCKS() {
  var values = [];
  var sheets = SpreadsheetApp.getActive().getSheets();
  for (var i in sheets) {
    var sheet = sheets[i];
    var top = sheet.getRange(getStockSheetHeaderRow("Ticker"), 1, 1, 2).getValues();
    if (top[0][0] == stockSheetHeaderRows[0][0] && top[0][1].substr(0, 9) != "CURRENCY:") {
      values.push(sheet.getName());
    }
  }
  values.sort();
  var out = [];
  for (var i in values) {
    out.push([values[i]]);
  }
  if (out.length == 0) {
    return null;
  }
  return out;
}

/**
 * Ensures the ticker has the data tracked for the specified date.
 *
 * @param {ticker} ticker of a stock/currency/mutual fund.
 * @param {date} date at which the security must be tracked.
 * @return TRUE.
 * @customfunction
 */
function ENSURE_TRACKED(ticker, date) {
  // TODO!!
  return true;
}


// General and Hooks.


function onOpen(e) {
  var ui = SpreadsheetApp.getUi();
  var menu = ui.createMenu("Stocks");
  menu.addItem("Update all sheets", "updateAllSheets");
  menu.addItem("Update current sheet", "updateCurrentSheet");
  menu.addSeparator();
  menu.addItem("Track a new <stock/currency/ETF/mutual fund> via a new sheet", "newStockSheet");
  menu.addItem("Create a new transactional account sheet (unregistered/401k/RRSP/etc)", "newAccountSheet");
  menu.addSeparator();

  var destructive = ui.createMenu("DESTRUCTIVE functions");
  destructive.addItem("Fix date of currently selected cells to YYYY-MM-DD", "fixDateRange");
  destructive.addSeparator();
  destructive.addItem("Format current sheet as stock", "formatCurrentSheetAsStock");
  destructive.addItem("Format current sheet as account", "formatCurrentSheetAsAccount");
  destructive.addItem("Format current sheet as summary", "formatCurrentSheetAsSummary");
  destructive.addSeparator();
  destructive.addItem("Internal self test", "selfTest");
  menu.addSubMenu(destructive);
  menu.addToUi();

  // Automatically bootstrap if the spreadsheet is virgin.
  var sheets = SpreadsheetApp.getActive().getSheets();
  if (sheets.length == 1) {
    if (sheets[0].getLastRow() == 1 && sheets[0].getLastColumn() == 1) {
      bootstrap();
      return;
    }
  }
  // Doesn't seem to work anyway:
  //updateAllSheets();
}

// Creates everything for a fresh spreadsheet.
// This function assumes there's only one sheet in the spreadsheet and the current sheet is empty. 
// It sets up the current sheet as the summary sheet.
// It creates account sheets.
// It creates stock sheets.
function bootstrap() {
  formatCurrentSheetAsSummary();
  // .. not yet.
}

// Updates all sheets, silently ignoring invalid ones.
function updateAllSheets() {
  var sheets = SpreadsheetApp.getActive().getSheets();
  for (var i in sheets) {
    updateSheet(sheets[i], false);
  }
}

// Updates the current sheet, warn the user if it is invalid.
function updateCurrentSheet() {
  if (!updateSheet(SpreadsheetApp.getActiveSheet(), true)) {
    SpreadsheetApp.getUi().alert("Invalid sheet!");
  }
}

// Updates the current sheet by determining what kind of sheet it is.
function updateSheet(sheet, resizeColumns) {
  var topLeft = sheet.getRange("A1").getValue();
  if (topLeft == stockSheetHeaderRows[0][0]) {
    return updateStockSheet(sheet, resizeColumns);
  } else if (topLeft == accountSheetHeaderRows[0][0]) {
    return updateAccountSheet(sheet, resizeColumns);
  } else if (topLeft == summarySheetHeaderRows[0][0]) {
    return updateSummarySheet(sheet, resizeColumns);
  }
  return false;
}

// Creates a temporary sheet tracking a known stock for a specific period and assert the values are exactly the one expected.
// This is to ensure there's no error with Date timezone (e.g. if the sheet is set to GMT+11 vs GMT-11), locale ('.' vs ',' for decimals), etc.
// What about stock splits?
function selfTest() {
  var ui = SpreadsheetApp.getUi()
  var menu = ui.alert("To be implemented soon");
  return;
  var training_sets = {
    "TSE:BMO": [
      ["Currency", "CAD"],
    ],
    "AAPL": [
      ["Currency", "USD"],
    ],
    "CURRENCY:USDCAD": [
      ["Currency", "USD"],
    ],
  }
  var ss = SpreadsheetApp.getActive();
  var previousActive = ss.getActiveSheet();
  for (var i in training_sets) {
    var expectation = training_sets[i];
    // Create a new temporary sheet. It's tricky because the user could be 
    var sheet = ss.insertSheet();
    ss.deleteSheet(sheet);
    // Load data for a few days.
    // Update with a few more days.
    // Verify the values of all cells.
    // Get the chart range and assert it is the exact full extent of the data.
  }
  previousActive.activate();
}


// Stock sheets management. It's a misnomer because this includes currency exchange rate and mutual funds.


// Information header. If you rename any item, you need to change the code AND your existing sheets!
// Each line is [<A column text>, <B column text>, <B column alignment>, <B column format>, <notes>].
// <B column format> can be "$" to mean it represent money in the local currency. 
var stockSheetHeaderRows = [
  [
    "Ticker", "<replaced by ticker>", "right", "@STRING@",
    "The ticker is fully qualified. This is necessary to differentiate between stocks listed with the same name on two exchanges like NYSE:BMO and TSE:BMO.",
  ],
  [
    "Currency", "<replaced by currency>", "right", "@STRING@",
    "Currency in which the stock is traded.",
  ],
  [
    "Asset Type", "<change me>", "right", "@STRING@",
    "Asset type is one of Currency, Stock, ETF, MutualFund, Bond. An ETF of Bonds would be marked as Bond.",
  ],
  [
    "Weight", "<change me>", "right", "@STRING@",
    "Country represented is one of CA, US, Intl or whatever user defined. For example TSE:VDU is traded in CAD but tracks international stocks everywhere except in the US.",
  ],
  [
    "Name", "<change me>", "left", "@STRING@",
    "Long name, as in \"Alphabet Inc.\" for \"GOOG\" and \"GOOGL\".",
  ],
  [
    "Tracked Index", "<change me>", "left", "@STRING@",
    "Mostly useful for ETFs which describe which index is tracked.",
  ],
  [
    "URL", "<change me>", "left", "@STRING@",
    "URL of the vendor for ETF, e.g. Vanguard, BlackRock, etc.",
  ],
  [
    "Current", "=GOOGLEFINANCE(VLOOKUP(\"Ticker\"; $A1:$B; 2; FALSE))", "right", "$",
    "Current value. This is useful for live calculation. It could be safely replaced with the \"Close\" value at the last row.",
  ],
  [
    "Shares", "=GOOGLEFINANCE(VLOOKUP(\"Ticker\"; $A1:$B; 2; FALSE); \"shares\")/1000000", "right", "0.00 \"M\"",
    "Number of outstanding shares if relevant. At best shares could be tracked on a quaterly basis but Google Finance doesn't give this value.",
  ],
  [
    "Market cap", "=GOOGLEFINANCE(VLOOKUP(\"Ticker\"; $A1:$B; 2; FALSE); \"marketcap\")/1000000", "right", "#,##0\\ \"M\"[$$-C0C]",
    "Market capitalization if relevant. Market Cap is dependent on number of shares.",
  ],
  [
    "Close low", "=MIN(OFFSET($E$1:$E; MATCH(\"Date\"; $A$1:$A); 0))", "right", "$",
    "Lowest value in the tracked closing values below.",
  ],
  [
    "Close high", "=MAX(OFFSET($E$1:$E; MATCH(\"Date\"; $A$1:$A); 0))", "right", "$",
    "Highest value in the tracked closing values below.",
  ],

  // Insert new automatically created row here.

  ["=HYPERLINK(GET_GFINANCE_LINK(VLOOKUP(\"Ticker\"; $A1:$B; 2; FALSE)); \"Google Finance\")", null, null, null, null],
  ["=HYPERLINK(GET_YFINANCE_LINK(VLOOKUP(\"Ticker\"; $A1:$B; 2; FALSE)); \"Yahoo Finance\")", null, null, null, null],
  ["=HYPERLINK(GET_MORNINGSTAR_LINK(VLOOKUP(\"Ticker\"; $A1:$B; 2; FALSE); VLOOKUP(\"Currency\"; $A1:$B; 2; FALSE)); \"Morning Star\")", null, null, null, null],
  [
    "<insert rows here>", null, null, null,
    "User should add his/her data here.",
  ],
  // Empty line before the raw data.
  ["", null, null, null, null],
];

// Returns the row 1-based index. It uses the global here and doesn't look at the actual
// sheet. This is much faster but doesn't work if people modify the top rows.
function getStockSheetHeaderRow(title) {
  for (var i = 0; i < stockSheetHeaderRows.length; i++) {
    if (stockSheetHeaderRows[i][0] == title) {
      return i+1;
    }
  }
  SpreadsheetApp.getUi().alert("Internal error: Failed to find title \"" + title + "\" in stockSheetHeaderRows.");
}

// Adds the missing rows to a sheet, then update the metadata.
// Resizing columns is super slow so only do it optionally.
// Gets the last line in column "A" to retrieve the date of the most
// recent line, then add new lines until yesterday.
// Returns false if the sheet is broken.
function updateStockSheet(sheet, resizeColumns) {
  var ticker = sheet.getRange(getStockSheetHeaderRow("Ticker"), 2).getValue();
  var lastRow = sheet.getLastRow();
  var startDate = nextDay(toStr(sheet.getRange(lastRow, 1).getValue()));
  Logger.log("Updating:", startDate, lastRow);
  var values = getDayValuesUpToYesterday(sheet, ticker, lastRow + 1, startDate, false);
  if (values == null) {
    // No new update, stop right away.
    return true;
  }
  sheet.getRange(lastRow + 1, 1, values.length, values[0].length).setValues(values);
  formatStockLines(sheet, lastRow+1, values.length, getCurrentFmt(ticker));
  lastRow += values.length;
  
  // Find the first row of data based on the content. This permits to safely add new header lines up to 40.
  var searchRows = 40;
  var values = sheet.getRange(1, 1, searchRows, 1).getValues();
  var firstRow = -1;
  for (var y in values) {
    if (values[y][0] == "Date") {
      firstRow = y + 1;
      break
    }
  }
  if (firstRow == -1) {
    SpreadsheetApp.getUi().alert("Did you add more than " + searchRows + " rows before the data? If so, update the script. Otherwise, fix the sheet.");
    return false;
  }
  return updateStockSheetInner(sheet, ticker, firstRow, lastRow, resizeColumns);
}

// Update the metadata of a sheet.
function updateStockSheetInner(sheet, ticker, firstRow, lastRow, resizeColumns) {
  // Trim lines.
  var delta = sheet.getMaxRows() - lastRow;
  if (delta > 10) {
    sheet.deleteRows(lastRow+1, delta - 10);
  }

  // Resize the columns with some margin. This is very slow, 1s per column.
  if (resizeColumns) {
    SpreadsheetApp.flush();
    if (isCurrency(ticker)) {
      sheet.autoResizeColumn(1);
      sheet.setColumnWidth(1, sheet.getColumnWidth(1)+10);
      sheet.autoResizeColumn(2);
      sheet.setColumnWidth(2, sheet.getColumnWidth(2)+10);
      sheet.autoResizeColumn(5);
      sheet.setColumnWidth(5, sheet.getColumnWidth(5)+10);
    } else {
      for (var i = 1; i < 8; i++) {
        sheet.autoResizeColumn(i);
        sheet.setColumnWidth(i, sheet.getColumnWidth(i)+10);
      }
    }
  }
  return createStockSheetChart(sheet, ticker, firstRow, lastRow);
}

// Creates the graph for the data.
// Recreate the chart everytime. This permits updating the chart style for older sheets.
// Returns true.
function createStockSheetChart(sheet, ticker, firstRow, lastRow) {
  var charts = sheet.getCharts();
  for (var i in charts) {
    sheet.removeChart(charts[i]);
  }

  // It is very confusing that EmbeddedChartBuilder is very difference from Charts.newAreaChart().
  // Don't be misled by reading the wrong doc!
  // https://developers.google.com/chart/interactive/docs/reference#options
  // https://developers.google.com/chart/interactive/docs/gallery/linechart#configuration-options
  // http://icu-project.org/apiref/icu4c/classDecimalFormat.html#details
  var currency = sheet.getRange(getStockSheetHeaderRow("Currency"), 2).getValue();
  var width = sheet.getColumnWidth(8);
  var legend = {
  };
  var hAxis = {
    "gridlines": {
      "count": -1,
      "units": {
        "years": {"format": ["yy-MM"]},
        "months": {"format": ["yy-MM", "-MM", ""]},
      },
    },
    "minorGridlines": {
      "count": -1,
      "units": {
        "months": {"format": ["yy-MM", "-MM", ""]},
      },
    },
  };
  var range = sheet.getRange(firstRow - 1, 1, lastRow - firstRow + 1, 6);
  var values = range.getValues();
  if (isCurrency(ticker)) {
    var series = {};
  } else {
    // Cut the volume line at half of the graph.
    var maxVolume = 0;
    for (var i in values) {
      if (values[i][5] > maxVolume) {
        maxVolume = values[i][5];
      }
    }
    var series = {
      0: {"targetAxisIndex": 0},
      1: {"targetAxisIndex": 0},
      2: {"targetAxisIndex": 0},
      3: {"targetAxisIndex": 0},
      4: {"targetAxisIndex": 1},
    }
  }
  var vAxes = {
    0: {
      "title": currency,
    },
    1: {
      "format": "#,##0",
      "gridlines": {"count": 0},
      "title": "Volume",
      "maxValue": maxVolume * 2,
    },
  };
  var chart = sheet.newChart().addRange(range)
       .asLineChart()
       .setPosition(4, 8, 0, 0)
       .setOption("legend", legend)
       .setOption("hAxis", hAxis)
       .setOption("series", series)
       .setOption("vAxes", vAxes)
       .setOption("title", ticker + " " + toStr(values[1][0]) + " ~ " + toStr(values[values.length-1][0]))
       .setOption("width", width)
       .build();
  sheet.insertChart(chart);
  return true;
}

// Creates a new sheet to track a new stock, ETF or exchange rate.
function newStockSheet() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt("Initializing new sheet", "Please give the fully qualified ticker symbol, e.g. NASDAQ:GOOGL or TSE:BMO.\nFor currency exchange rate, use CURRENCY:FROMTO, e.g. CURRENCY:USDCAD.\nFor funds, you have to find the fund code, which may be harder to find. An example is MUTF_CA:FER050.", ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() == ui.Button.CANCEL) {
    return false;
  }
  var ticker = response.getResponseText().toUpperCase();
  var tickerParts = ticker.split(":");
  if (tickerParts.length != 2) {
    ui.alert("Please use EXCHANGE:SYMBOL format.");
    return false;
  }
  var sheetName = tickerParts[tickerParts.length-1];
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(sheetName);
  if (sheet != null) {
    ui.alert("Sheet '" + sheetName + "' already exist! Delete it first.");
    return false;
  }
  sheet = ss.insertSheet(sheetName);
  return formatSheetAsStock(sheet, ticker);
}

function formatCurrentSheetAsStock() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt("WARNING: This destructs the current sheet", "Please give the fully qualified ticker symbol, e.g. NASDAQ:GOOGL or TSE:BMO.\nFor currency exchange rate, use CURRENCY:FROMTO, e.g. CURRENCY:USDCAD.\nFor funds, you have to find the fund code, which may be harder to find. An example is MUTF_CA:FER050.", ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() == ui.Button.CANCEL) {
    return false;
  }
  var ticker = response.getResponseText().toUpperCase();
  var tickerParts = ticker.split(":");
  if (tickerParts.length != 2) {
    ui.alert("Please use EXCHANGE:SYMBOL format.");
    return false;
  }
  return formatSheetAsStock(clearSheet(SpreadsheetApp.getActiveSheet()), ticker);
}

function formatSheetAsStock(sheet, ticker) {
  var ui = SpreadsheetApp.getUi();
  var tickerParts = ticker.split(":");
  // Get the starting date and get the initial data.
  while (true) {
    var defaultDate = (new Date()).getFullYear() + "-01-01";
    var response = ui.prompt("Initializing new sheet", "When do you want to start?\nThe format is YYYY, YYYY-MM or YYYY-MM-DD.\nIf unspecified, it starts at " + defaultDate + ".", ui.ButtonSet.OK_CANCEL);
    if (response.getSelectedButton() == ui.Button.CANCEL) {
      return false;
    }
    var startDate = response.getResponseText();
    if (startDate == "") {
      startDate = defaultDate;
    }
    if (startDate.match(/^\d\d\d\d$/)) {
      startDate += "-01-01";
    }
    if (startDate.match(/^\d\d\d\d-\d\d$/)) {
      startDate += "-01";
    }
    Logger.log("Chose date", startDate);
    if (!startDate.match(/^\d\d\d\d-\d\d-\d\d$/)) {
      ui.alert("Invalid date.");
      continue;
    }
    if (!getDaysBetween(startDate, previousDay(getToday()))) {
      ui.alert("Date must be at least one day before yesterday.");
      continue;
    }
    // Initialize the data right away before the headers. This saves a few RPCs.
    var data = getDayValuesUpToYesterday(sheet, ticker, stockSheetHeaderRows.length + 1, startDate, true);
    if (data == null) {
      ui.alert("Failed to find a date where this ticker is valid. Try earlier?");
      continue;
    }
    break;
  }

  // Sets the data.
  sheet.getRange(stockSheetHeaderRows.length + 1, 1, data.length, data[0].length).setValues(data);
  var currencyFmt = getCurrentFmt(ticker);
  formatStockLines(sheet, stockSheetHeaderRows.length + 2, data.length - 1, currencyFmt);
  
  // Fix the data headers. Sadly dividends are not supported by GOOGLEFINANCE() so one has to track it manually! :(
  if (tickerParts[0] == "CURRENCY" || tickerParts[0].substr(0, 4) == "MUTF") {
    // Clears Open, High, Low, Volume and Dividend.
    sheet.getRange(stockSheetHeaderRows.length + 1, 2, 1, 3).setValue("");
    sheet.getRange(stockSheetHeaderRows.length + 1, 6, 1, 2).setValue("");
    sheet.setColumnWidth(3, 15);
    sheet.setColumnWidth(4, 15);
    sheet.setColumnWidth(6, 15);
    sheet.setColumnWidth(7, 15);
  } else {
    sheet.getRange(stockSheetHeaderRows.length + 1, data[0].length + 1).setValue("Dividend");
  }
  sheet.getRange(stockSheetHeaderRows.length + 1, 1, 1, data[0].length + 1).setFontWeight("bold").setHorizontalAlignment("center");

  // Sets the sheet header.
  var values = [];
  var notes = [];
  for (var i in stockSheetHeaderRows) {
    if (stockSheetHeaderRows[i].length != 5) {
      ui.alert("Internal error: stockSheetHeaderRows[" + i + "] is misconfigured");
      return false;
    }
    values[i] = [stockSheetHeaderRows[i][0]];
    notes[i] = [stockSheetHeaderRows[i][4]];
  }
  sheet.getRange(1, 1, values.length, 1).setFontWeight("bold").setValues(values).setNotes(notes);
  var values = [];
  var fmt = [];
  var align = [];
  for (var i = 0; i < stockSheetHeaderRows.length; i++) {
    if (stockSheetHeaderRows[i][1] == null) {
      break;
    }
    values[i] = [stockSheetHeaderRows[i][1]];
    if (stockSheetHeaderRows[i][3] == "$") {
      fmt[i] = [currencyFmt];
    } else {
      fmt[i] = [stockSheetHeaderRows[i][3]];
    }
    align[i] = [stockSheetHeaderRows[i][2]];
  }
  values[getStockSheetHeaderRow("Ticker")-1] = [ticker];
  if (tickerParts[0] == "CURRENCY") {
    var from = tickerParts[1].substr(0, 3);
    var to = tickerParts[1].substr(3, 3);
    values[getStockSheetHeaderRow("Currency")-1] = [to];
    values[getStockSheetHeaderRow("Asset Type")-1] = ["Currency"];
    values[getStockSheetHeaderRow("Name")-1] = [from + ":" + to];
    // Use the symbol once available.
    values[getStockSheetHeaderRow("Tracked Index")-1] = ["Value of 1 " + from + " in " + to];
  } else if (tickerParts[0] == "MUTF") {
    // US Mutual Fund.
    values[getStockSheetHeaderRow("Currency")-1] = ["USD"];
    values[getStockSheetHeaderRow("Asset Type")-1] = ["MutualFund"];
  } else if (tickerParts[0] == "MUTF_CA") {
    // Canadian Mutual Fund.
    values[getStockSheetHeaderRow("Currency")-1] = ["CAD"];
    values[getStockSheetHeaderRow("Asset Type")-1] = ["MutualFund"];
  } else {
    values[getStockSheetHeaderRow("Currency")-1] = [sheet.getRange(getStockSheetHeaderRow("Currency"), 2).setValue(getGOOGLEFINANCE([ticker, "currency"])).getValue()];
    values[getStockSheetHeaderRow("Asset Type")-1] = ["Stock"];
  }
  if (values[getStockSheetHeaderRow("Currency")-1][0] == "#N/A") {
    ui.alert(ticker + " is not a valid ticker. Delete the sheet and try again.");
    return false;
  }
  var range = sheet.getRange(1, 2, values.length, 1).setHorizontalAlignments(align).setValues(values).setNumberFormats(fmt);
  // Zap out the formulas returning #N/A.
  var values = range.getValues();
  for (var i = 0; i < values.length; i++) {
    if (values[i][0] == "#N/A") {
      sheet.getRange(i+1, 2).setValue("");
    }
  }

  // Tidy the sheet.
  var delta = sheet.getMaxColumns() - data[0].length - 2;
  if (delta) {
    sheet.deleteColumns(data[0].length + 3, delta);
  }
  sheet.setColumnWidth(data[0].length + 2, 1000);
  highlightFormulas(sheet);

  // Format the headers and create the graph.
  return updateStockSheetInner(sheet, ticker, stockSheetHeaderRows.length + 2, stockSheetHeaderRows.length + 1 + data.length, true);
}

// Format lines of data.
// GOOGLEFINANCE() format plus Divident column: Date, Open, High, Low, Close, Volume, Dividend.
function formatStockLines(sheet, row, numRows, currencyFmt) {
  sheet.getRange(row, 1, numRows, 1).setNumberFormat("yyyy-MM-dd").setHorizontalAlignment("left");
  sheet.getRange(row, 2, numRows, 4).setNumberFormat(currencyFmt);
  sheet.getRange(row, 6, numRows, 1).setNumberFormat("#,##0");
}

// Returns the format to use for the ticker.
function getCurrentFmt(ticker) {
  if (isCurrency(ticker)) {
    // Exchange rate need more precision.
    return "#,##0.0000\ [$$-C0C]";
  }
  return "#,##0.00\ [$$-C0C]";
}


// Account (transaction) sheet management.


// Format: [<A column>, <B column>, <A note>].
var accountSheetHeaderRows = [
  ["Account Name", "<change me>", "Name you want to give to this account or any explanation."],
  ["Account Currency", "<replaced by answer>", "Currency in which the securities are traded in."],
  ["Tax Currency", "=Summary!$B$1", null],
  ["Account Number", "<change me>", "Account number for your personal tracking purpose."],
  ["Account Type", "Unregistered", "Type of tax shelter, 401k, RRSP, TFSA, RESP, etc."],
  ["<insert rows here>", null, "User should add his/her data here."],
  ["", "", null],
];

// Returns the row 1-based index. It uses the global here and doesn't look at the actual
// sheet. This is much faster but doesn't work if people modify the top rows.
function getAccountSheetHeaderRow(title) {
  for (var i = 0; i < accountSheetHeaderRows.length; i++) {
    if (accountSheetHeaderRows[i][0] == title) {
      return i+1;
    }
  }
  SpreadsheetApp.getUi().alert("Internal error: Failed to find title \"" + title + "\" in accountSheetHeaderRows.");
}

// Internal speed up variable.
var accountFirstLine = accountSheetHeaderRows.length + 2;
var accountCell = "$B$" + getAccountSheetHeaderRow("Account Currency");
var taxCell = "$B$" + getAccountSheetHeaderRow("Tax Currency");

// Zap the conversion columns if the currency is the same.
var accountSheetDataHeaders = [
  [
    "Date", "Ticker", "=" + accountCell + " & \"/stock\"", "# stock", "Close",
    // e.g. "Total CAD"
    "=\"Total \" & " + accountCell,
    // e.g. "CAD"
    "=" + taxCell,
    // e.g. "Total CAD"
    "=\"Total \" & " + taxCell,
    "ACB",
    "Type", "Notes", "",
    "Ticker",
    "# stock",
    "=" + taxCell,
    "ACB",
  ],
  [
    "", "", "", "", "=IF($B"+accountFirstLine+"=\"\"; \"\"; VLOOKUP($A"+accountFirstLine+"; INDIRECT($B"+accountFirstLine+"&\"!$A1:E\"); 5))",
    "=$C"+accountFirstLine+"*$D"+accountFirstLine,
    // Zapped out when the currency match.
    "=VLOOKUP($A"+accountFirstLine+"; INDIRECT($B$2&$B$3 & \"!$A$1:$E\"); 5)",
    "=$F"+accountFirstLine+"*$G"+accountFirstLine,
    // ACB
    "",
    "", "", "",
    "=SORT(UNIQUE($B$"+accountFirstLine+":$B))",
    "=IF($M"+accountFirstLine+"=\"\"; \"\"; SUMIF($B$"+accountFirstLine+":$B; \"=\"&$M"+accountFirstLine+"; $D$"+accountFirstLine+":$D))",
    "=IF($M"+accountFirstLine+"=\"\"; \"\"; SUMIF($B$"+accountFirstLine+":$B; \"=\"&$M"+accountFirstLine+"; $H$"+accountFirstLine+":$H))",
    "=IF($M"+accountFirstLine+"=\"\"; \"\"; $O"+accountFirstLine+"/$N"+accountFirstLine+")",
  ],
];

// Formatting for the second column.
var accountSheetDataFmt = [
  [
    "yyyy-MM-dd", "@STRING@", "#,##0.00\ [$$-C0C]", "#,##0", "#,##0.00\ [$$-C0C]",
    "#,##0.00\ [$$-C0C]",
    "#,##0.00\ [$$-C0C]", "#,##0.00\ [$$-C0C]",
    "#,##0.00\ [$$-C0C]",
    "@STRING@", "@STRING@", "@STRING@",
    "@STRING@",
    "#,##0",
    "#,##0.00\ [$$-C0C]",
    "#,##0.00\ [$$-C0C]",
  ],
];

function updateAccountSheet(sheet, resizeColumns) {
  return true;
}
  
// Creates a new sheet to track a broker account.
function newAccountSheet() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt("Initializing new account sheet", "Please give short name for which you'll track your account with.\nFor example for Americans, \"Joe 401k\", \"Joe Unregistered\".\nFor Canadians, \"Jane RRSP\", \"Jane TFSA\", \"Jane RESP\", \"Jane spouse RRSP\" (yeah, Canada has a lot of tax shelters!) plus \"Jane CAD\" and \"Jane USD\" accounts.", ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() == ui.Button.CANCEL) {
    return false;
  }
  var sheetName = response.getResponseText();
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(sheetName);
  if (sheet != null) {
    ui.alert("Sheet '" + sheetName + "' already exist! Delete it first.");
    return false;
  }
  return formatSheetAsAccount(ss.insertSheet(sheetName));
}

function formatCurrentSheetAsAccount() {
  return formatSheetAsAccount(clearSheet(SpreadsheetApp.getActiveSheet()));
}

function formatSheetAsAccount(sheet) {
  var ui = SpreadsheetApp.getUi();
  var summarySheet = SpreadsheetApp.getActive().getSheetByName("Summary");
  if (summarySheet == null) {
    ui.alert("Please create the summary sheet first!");
    return false;
  }
  var taxCurrency = summarySheet.getRange(getSummarySheetHeaderRow("Currency"), 2).getValue();
  while (true) {
    var response = ui.prompt("Initializing new account sheet", "In what currency is the account traded in (e.g. CAD, USD)? Defaults to " + taxCurrency + ".", ui.ButtonSet.OK_CANCEL);
    if (response.getSelectedButton() == ui.Button.CANCEL) {
      return false;
    }
    var accountCurrency = response.getResponseText().toUpperCase();
    if (accountCurrency == "") {
      accountCurrency = taxCurrency;
    }
    if (accountCurrency.length == 3) {
      break
    }
  }

  var values = [];
  var notes = [];
  for (var i in accountSheetHeaderRows) {
    if (accountSheetHeaderRows[i].length != 3) {
      SpreadsheetApp.getUi().alert("Internal error: accountSheetHeaderRows[" + i + "] is misconfigured");
    }
    values[i] = [accountSheetHeaderRows[i][0], accountSheetHeaderRows[i][1]];
    notes[i] = [accountSheetHeaderRows[i][2]];
  }
  values[1][1] = accountCurrency;
  sheet.getRange(1, 1, values.length, values[0].length).setValues(values).setHorizontalAlignment("left");
  sheet.getRange(1, 1, values.length, 1).setFontWeight("bold").setNotes(notes);

  sheet.getRange(accountSheetHeaderRows.length+1, 1, accountSheetDataHeaders.length, accountSheetDataHeaders[0].length).setValues(accountSheetDataHeaders);
  sheet.getRange(accountSheetHeaderRows.length+1, 1, 1, accountSheetDataHeaders[0].length).setFontWeight("bold").setHorizontalAlignment("center");
  var range = sheet.getRange(accountSheetHeaderRows.length+2, 1, 1, accountSheetDataHeaders[0].length);
  range.setHorizontalAlignment("right").setNumberFormats(accountSheetDataFmt);
  
  if (accountCurrency == taxCurrency) {
    // True the majority of the time; zap out the currency conversion column.
    // The columns are hard coded. :(
    var totalCurrencyRow = 6;
    sheet.getRange(accountSheetHeaderRows.length+2, totalCurrencyRow+2).setValue(sheet.getRange(accountSheetHeaderRows.length+2, totalCurrencyRow).getValue());
    sheet.getRange(accountSheetHeaderRows.length+1, totalCurrencyRow, 2, 2).clearContent();
    sheet.setColumnWidth(totalCurrencyRow, 10);
    sheet.setColumnWidth(totalCurrencyRow+1, 10);
  }

  range.copyTo(sheet.getRange(accountSheetHeaderRows.length+3, 1, accountSheetHeaderRows.length+103, accountSheetDataHeaders[0].length));
  // Ticker is special because it uses UNIQUE().
  // Column is hard coded.
  sheet.getRange(accountSheetHeaderRows.length+3, 13, accountSheetHeaderRows.length+103, 1).clearContent();

  var lastrow = sheet.getLastRow();
  var delta = sheet.getMaxRows() - lastrow;
  if (delta > 0) {
    sheet.deleteRows(lastrow+1, delta);
  }
  var lastcol = sheet.getLastColumn();
  var delta = sheet.getMaxColumns() - lastcol;
  if (delta > 0) {
    sheet.deleteColumns(lastcol+1, delta);
  }
  for (var i = 1; i < lastcol; i++) {
    if (accountSheetDataHeaders[0][i-1] == "") {
      sheet.setColumnWidth(i, 50);
    } else {
      sheet.autoResizeColumn(i);
    }
  }
  highlightFormulas(sheet);
  sheet.setActiveSelection("A1");
  return true;
}


// Summary sheet management.


// Format: [<A column>, <B column>, <A note>].
var summarySheetHeaderRows = [
  ["Currency", "CAD", "Currency in which you are taxed in."],
  ["<insert rows here>", null, "User should add his/her data here."],
  ["", "", null],
];

// Returns the row 1-based index. It uses the global here and doesn't look at the actual
// sheet. This is much faster but doesn't work if people modify the top rows.
function getSummarySheetHeaderRow(title) {
  for (var i = 0; i < summarySheetHeaderRows.length; i++) {
    if (summarySheetHeaderRows[i][0] == title) {
      return i+1;
    }
  }
  SpreadsheetApp.getUi().alert("Internal error: Failed to find title \"" + title + "\" in summarySheetHeaderRows.");
}

var summarySheetDataRows = [
  ["Account", "StockCA", "StockUS", "StockIntl", "Bond", "Income", "Total CAD", "", "Stock", "Current"],
    ["=ACCOUNTS()", "", "", "", "", "=SUM($B2:$F2)", "=G2/$O$16", "", "=TRACKED_STOCKS()", "=INDIRECT($I2:I & \"!$B$8\")"],
];

function updateSummarySheet(sheet, resizeColumns) {
  return true;
}

function formatCurrentSheetAsSummary() {
  return formatSheetAsSummary(clearSheet(SpreadsheetApp.getActiveSheet().setName("Summary")));
}

// Formats the current sheet as a Summary sheet.
function formatSheetAsSummary(sheet) {
  var values = [];
  var notes = [];
  for (var i in summarySheetHeaderRows) {
    if (summarySheetHeaderRows[i].length != 3) {
      SpreadsheetApp.getUi().alert("Internal error: summarySheetHeaderRows[" + i + "] is misconfigured");
      return false;
    }
    values[i] = [summarySheetHeaderRows[i][0], summarySheetHeaderRows[i][1]];
    notes[i] = [summarySheetHeaderRows[i][2]];
  }
  sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
  sheet.getRange(1, 1, values.length, 1).setFontWeight("bold").setNotes(notes);

  sheet.getRange(values.length+1, 1, summarySheetDataRows.length, summarySheetDataRows[0].length).setValues(summarySheetDataRows);
  sheet.getRange(values.length+1, 1, 1, summarySheetDataRows[0].length).setFontWeight("bold").setHorizontalAlignment("center");

  var lastcol = sheet.getLastColumn();
  var delta = sheet.getMaxColumns() - lastcol;
  if (delta > 0) {
    sheet.deleteColumns(lastcol+1, delta);
  }
  for (var i = 1; i < lastcol; i++) {
    sheet.autoResizeColumn(i);
  }
  highlightFormulas(sheet);
  return true;
}


// Utilities.


// Clears a sheet into a pristine sheet of 26 columns, 1000 rows.
function clearSheet(sheet) {
  var limitRows = 1000;
  var limitCols = 26;
  sheet.clear().clearNotes();
  var maxRows = sheet.getMaxRows();
  if (maxRows > limitRows) {
    sheet.deleteRows(1, maxRows-limitRows);
  } else if (maxRows < limitRows) {
    sheet.insertRowsAfter(1, limitRows-maxRows);
  }
  var maxCols = sheet.getMaxColumns();
  if (maxCols > limitCols) {
    sheet.deleteColumns(1, maxCols-limitCols);
  } else if (maxCols < limitCols) {
    sheet.insertColumnsAfter(1, limitCols-maxCols);
  }
  return sheet;
}

// Highlights all formulas to clarify to the user what is raw data and what is "calculated".
function highlightFormulas(sheet) {
  var range = sheet.getDataRange();
  var colors = [];
  var formulas = range.getFormulas();
  for (var y = 0; y < formulas.length; y++) {
    colors[y] = [];
    for (var x = 0; x < formulas[y].length; x++) {
      if (formulas[y][x].substr(0, 1) == "=") {
        colors[y][x] = "#F8F8FF";
      } else {
        colors[y][x] = null;
      }
    }
  }
  range.setBackgrounds(colors);
}


// Utilities: Date


// Converts the insane MM/DD/YYYY format to "YYYY-MM-DD" and fix the formatting.
function fixDateRange() {
  var range = SpreadsheetApp.getActiveSheet().getActiveRange();
  var values = range.getValues();
  for (var y in values) {
    for (var x in values[y]) {
      values[y][x] = toStr(values[y][x]);
      if (values[y][x].indexOf("/") != -1) {
        // Assumes MM/dd/yyyy.
        var parts = values[y][x].split("/");
        values[y][x] = parts[2] + "-" + parts[0] + "-" + parts[1];
      }
    }
  }
  range.setNumberFormat("yyyy-MM-dd").setHorizontalAlignment("left").setValues(values);
  return true;
}


// Returns today as "YYYY-MM-DD".
function getToday() {
  return toStr(new Date());
}

// Converts a "YYYY-MM-DD" (or a integer) to a javascript Date object.
function toDate(s) {
  if (s instanceof Date) {
    return s;
  }
  if (typeof s === "number") {
    return new Date(s);
  }
  var parts = s.split("-");
  return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
}

// Converts a javascript Date object to "YYYY-MM-DD".
// Most importantly, it keeps the "0" to keep the length constant.
// For stocks, d will be "YYYY-MM-DD 16:00:00" but for currencies, it is "YYYY-MM-DD 23:58:00".
function toStr(d) {
  if (typeof d === "number") {
    assert(false);
    d = new Date(d);
  }
  if (d instanceof Date) {
    // Counter intuitively, we must not use d.getUTCFullYear() or d.toISOString() since the date was stored in locale timezone.
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  return d.split(" ")[0];
}

function pad(n) {
  if ((n + "").length == 1) {
    return "0" + n;
  }
  return n + "";
}

// Given "YYY-MM-DD", returns "YYYY-MM-DD" that is the day after.
function nextDay(day) {
  return toStr(new Date(toDate(day).getTime() + 24 * 60 * 60000));
}

// Given "YYY-MM-DD", returns "YYYY-MM-DD" that is the day before.
function previousDay(day) {
  return toStr(new Date(toDate(day).getTime() - 24 * 60 * 60000));
}

// Returns the number of days between two dates as Date instances.
function getDaysBetween(start, end) {
  var s = toDate(start).getTime() / 24 / 60 / 60000;
  var e = toDate(end).getTime() / 24 / 60 / 60000;
  if (s >= e) {
    return 0;
  }
  return e - s;
}


// Utilities: Stocks.


// Returns true if the ticker is a currency exchange.
// This function doesn't do RPC.
function isCurrency(ticker) {
  return ticker.substr(0, 9) == "CURRENCY:";
}

// Utilities: low level GOOGLEFINANCE functions.
// These could be replaced by something else than GOOGLEFINANCE, e.g. UrlFetchApp.fetch() to another data provider.

// Gets the stock value from the start day until yesterday.
// Returns a list of list, e.g. [[]].
function getDayValuesUpToYesterday(sheet, ticker, startRow, startDate, includeHeader) {
  var endDate = previousDay(getToday());
  var days = getDaysBetween(startDate, endDate);
  Logger.log("Between", startDate, endDate, days);
  if (!days) {
    return null;
  }
  var spare = sheet.getMaxRows() - startRow - 1;
  if (spare < days) {
    sheet.insertRowsAfter(startRow, days - spare);
  }
  var cell = sheet.getRange(startRow, 1).setValue(getGOOGLEFINANCE([ticker, "all", startDate, endDate]));
  var lastRow = sheet.getLastRow();
  Logger.log("", startRow, lastRow);
  var values = null;
  if (lastRow > startRow) {
    var start = startRow + 1;
    if (includeHeader) {
      start = startRow;
    }
    values = sheet.getRange(start, 1, lastRow - start + 1, 6).getValues(); 
    // Change the date to be only YYYY-MM-DD, not 16:00.
    for (var y in values) {
      if (!includeHeader || y) {
        values[y][0] = toStr(values[y][0]);
        for (var x in values[y]) {
          if (values[y][x] == "#N/A") {
            values[y][x] = ""
          }
        }
      }
    }
  }
  cell.clearContent();
  return values;
}

// Returns a GOOGLEFINANCE() call to put in a cell with properly escaped arguments.
// This function doesn't do RPC.
// https://support.google.com/docs/answer/3093281
// Sadly, GOOGLEFINANCE() is not accessible from Google Apps (!).
function getGOOGLEFINANCE(args) {
  var asStr = [];
  for (var a in args) {
    asStr.push("\"" + args[a] + "\"");
  }
  return "=GOOGLEFINANCE(" + asStr.join("; ") + ")";
}

let trades = [];

function saveTrade() {
  const item = document.getElementById("trade_item").value.trim();
  const wanted = document.getElementById("trade_wanted").value.trim();
  const desc = document.getElementById("trade_description").value.trim();
  const user = document.getElementById("trade_user").value.trim();

  if (!item || !wanted || !user) {
    alert("Please fill out required fields.");
    return;
  }

  const trade = {
    item,
    wanted,
    description: desc,
    user
  };

  trades.push(trade);
  addTradeToUI(trade);

  document.getElementById("tradeForm").reset();
}

function addTradeToUI(trade) {
  const feed = document.getElementById("tradeFeed");

  const card = document.createElement("div");
  card.classList.add("card", "mb-3", "p-3");

  card.innerHTML = `
    <h5>${trade.item} ➡️ ${trade.wanted}</h5>
    <p><strong>Description:</strong> ${trade.description || "None"}</p>
    <p><strong>Posted by:</strong> ${trade.user}</p>
  `;

  feed.prepend(card); // newest trade on top
}

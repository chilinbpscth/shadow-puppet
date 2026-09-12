export function remember(history, snapshot) {
  history.push(snapshot);
  if (history.length > 20) history.shift();
}

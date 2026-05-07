(function () {
  const DEFAULT_IDS = {
    speed: 'mouseSpeed',
    distance: 'mouseDistance',
    turns: 'mouseTurns',
    interactions: 'mouseInteractions',
  };

  const labels = {};

  function formatValue(value, decimals = 1) {
    return Number.isFinite(value) ? value.toFixed(decimals) : '0.00';
  }

  function init(ids = DEFAULT_IDS) {
    labels.speed = document.getElementById(ids.speed);
    labels.distance = document.getElementById(ids.distance);
    labels.turns = document.getElementById(ids.turns);
    labels.interactions = document.getElementById(ids.interactions);
    update();
  }

  function update(stats = {}) {
    const {
      speed = 0,
      distance = 0,
      turns = 0,
      interactions = 0,
    } = stats;

    if (labels.speed) {
      labels.speed.textContent = formatValue(speed, 2);
    }
    if (labels.distance) {
      labels.distance.textContent = formatValue(distance, 0);
    }
    if (labels.turns) {
      labels.turns.textContent = Math.round(turns).toString();
    }
    if (labels.interactions) {
      labels.interactions.textContent = Math.round(interactions).toString();
    }
  }

  window.MouseStatsSign = {
    init,
    update,
  };
})();

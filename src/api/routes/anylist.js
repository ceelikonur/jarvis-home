const express = require('express');
const router = express.Router();
const AnyListService = require('../../services/AnyListService');

// GET /api/anylist/status
router.get('/anylist/status', (req, res) => {
  res.json({ success: true, connected: AnyListService.isConnected() });
});

// GET /api/anylist/lists
router.get('/anylist/lists', async (req, res) => {
  try {
    const lists = await AnyListService.getLists();
    res.json({ success: true, data: lists });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/anylist/lists/:name
router.get('/anylist/lists/:name', async (req, res) => {
  try {
    const list = await AnyListService.getListByName(decodeURIComponent(req.params.name));
    if (!list) return res.status(404).json({ success: false, error: 'List not found' });
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/anylist/lists/:name/items — add item(s)
router.post('/anylist/lists/:name/items', express.json(), async (req, res) => {
  try {
    const listName = decodeURIComponent(req.params.name);
    const { item, items, quantity } = req.body;

    if (items && Array.isArray(items)) {
      const count = await AnyListService.addItems(listName, items);
      return res.json({ success: true, added: count });
    }

    if (!item) return res.status(400).json({ error: 'item or items[] required' });

    const result = await AnyListService.addItem(listName, item, quantity);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/anylist/lists/:name/items/:itemId/toggle
router.patch('/anylist/lists/:name/items/:itemId/toggle', async (req, res) => {
  try {
    const listName = decodeURIComponent(req.params.name);
    const result = await AnyListService.toggleItem(listName, req.params.itemId);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/anylist/lists/:name/items/:itemId
router.delete('/anylist/lists/:name/items/:itemId', async (req, res) => {
  try {
    const listName = decodeURIComponent(req.params.name);
    await AnyListService.removeItem(listName, req.params.itemId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/anylist/lists/:name/clear-checked
router.post('/anylist/lists/:name/clear-checked', async (req, res) => {
  try {
    const listName = decodeURIComponent(req.params.name);
    const count = await AnyListService.clearChecked(listName);
    res.json({ success: true, cleared: count });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

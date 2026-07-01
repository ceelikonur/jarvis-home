const AnyList = require('anylist');
const { config } = require('../config');

let client = null;
let connected = false;
let listsCache = [];
let lastFetch = 0;
const CACHE_TTL = 5_000; // 5 seconds — fast refresh for real-time updates

const AnyListService = {
  /**
   * Initialize and login to AnyList
   */
  async init() {
    if (!config.anylist.email || !config.anylist.password) {
      console.log('📋 AnyList: No credentials configured — skipping');
      return false;
    }

    try {
      client = new AnyList({
        email: config.anylist.email,
        password: config.anylist.password,
      });

      await client.login();
      connected = true;

      // Listen for real-time list updates — immediately refresh cache
      client.on('lists-update', (lists) => {
        listsCache = lists;
        lastFetch = Date.now();
      });

      // Start listening for WebSocket updates
      await client.getLists();
      listsCache = client.lists;
      lastFetch = Date.now();

      console.log(`📋 AnyList: Connected — ${listsCache.length} lists found`);
      return true;
    } catch (err) {
      console.error('📋 AnyList: Connection failed —', err.message);
      connected = false;
      return false;
    }
  },

  isConnected() {
    return connected;
  },

  async getLists() {
    if (!connected) return [];

    try {
      if (Date.now() - lastFetch > CACHE_TTL) {
        await client.getLists();
        listsCache = client.lists;
        lastFetch = Date.now();
      }

      return listsCache.map(list => ({
        id: list.identifier,
        name: list.name,
        items: (list.items || []).map(item => ({
          id: item.identifier,
          name: item.name,
          checked: item.checked || false,
          quantity: item.quantity || '',
          category: item.categoryMatchId || null,
        })),
      }));
    } catch (err) {
      console.error('📋 AnyList: getLists error —', err.message);
      return [];
    }
  },

  async getListByName(name) {
    if (!connected) return null;

    try {
      const list = client.getListByName(name);
      if (!list) return null;

      return {
        id: list.identifier,
        name: list.name,
        items: (list.items || []).map(item => ({
          id: item.identifier,
          name: item.name,
          checked: item.checked || false,
          quantity: item.quantity || '',
        })),
      };
    } catch (err) {
      console.error('📋 AnyList: getListByName error —', err.message);
      return null;
    }
  },

  /**
   * Add an item to a list
   * list.addItem() is async and sends to AnyList API directly
   */
  async addItem(listName, itemName, quantity) {
    if (!connected) throw new Error('AnyList not connected');

    try {
      const list = client.getListByName(listName);
      if (!list) throw new Error(`List "${listName}" not found`);

      const item = client.createItem({ name: itemName });
      if (quantity) item.quantity = quantity;

      await list.addItem(item);
      return { name: itemName, quantity: quantity || '' };
    } catch (err) {
      console.error('📋 AnyList: addItem error —', err.message);
      throw err;
    }
  },

  /**
   * Add multiple items to a list
   */
  async addItems(listName, items) {
    if (!connected) throw new Error('AnyList not connected');

    try {
      const list = client.getListByName(listName);
      if (!list) throw new Error(`List "${listName}" not found`);

      for (const itemName of items) {
        const item = client.createItem({ name: itemName });
        await list.addItem(item);
      }
      return items.length;
    } catch (err) {
      console.error('📋 AnyList: addItems error —', err.message);
      throw err;
    }
  },

  /**
   * Check/uncheck an item
   * item.save() sends property changes to AnyList API
   */
  async toggleItem(listName, itemId) {
    if (!connected) throw new Error('AnyList not connected');

    try {
      const list = client.getListByName(listName);
      if (!list) throw new Error(`List "${listName}" not found`);

      const item = list.getItemById(itemId);
      if (!item) throw new Error('Item not found');

      item.checked = !item.checked;
      await item.save();
      return { id: itemId, checked: item.checked };
    } catch (err) {
      console.error('📋 AnyList: toggleItem error —', err.message);
      throw err;
    }
  },

  /**
   * Remove an item from a list
   * list.removeItem() is async and sends to AnyList API directly
   */
  async removeItem(listName, itemId) {
    if (!connected) throw new Error('AnyList not connected');

    try {
      const list = client.getListByName(listName);
      if (!list) throw new Error(`List "${listName}" not found`);

      const item = list.getItemById(itemId);
      if (!item) throw new Error('Item not found');

      await list.removeItem(item);
      return true;
    } catch (err) {
      console.error('📋 AnyList: removeItem error —', err.message);
      throw err;
    }
  },

  /**
   * Clear checked items from a list
   */
  async clearChecked(listName) {
    if (!connected) throw new Error('AnyList not connected');

    try {
      const list = client.getListByName(listName);
      if (!list) throw new Error(`List "${listName}" not found`);

      const checked = list.items.filter(i => i.checked);
      for (const item of checked) {
        await list.removeItem(item);
      }
      return checked.length;
    } catch (err) {
      console.error('📋 AnyList: clearChecked error —', err.message);
      throw err;
    }
  },
};

module.exports = AnyListService;

var Shop = keyvalue.parseKVFile('Shop.kv');

var matrix = new Array();

function check(pID, item)
{
	if (matrix[pID] === undefined)
		matrix[pID] = new Array();
	
	if (matrix[pID][item] === undefined)
		matrix[pID][item] = 0;
	
}


function buy(client, item)
{
	var pID = client.netprops.m_iPlayerID;
	var dire = (client.netprops.m_iTeamNum == dota.TEAM_DIRE);
	
	var playerManager = game.findEntityByClassname(-1, "dota_player_manager");
	var data = dire ? game.findEntityByClassname(-1, "dota_data_dire") : game.findEntityByClassname(-1, "dota_data_radiant");
	
	if (!playerManager || !data)
	{
		client.printToChat("Invalid playerManager data");
		return false;
	}
	
	check(pID, item);
	if (matrix[pID][item] >= Shop.items[item].max_level)
	{
		client.printToChat("You are already at the max level!");
		return false;
	}
	
	var cost = getCost(pID, item);
	// Get gold...
	var gold = [ data.netprops.m_iReliableGold[pID],
	             data.netprops.m_iUnreliableGold[pID] ];
	
	// Check player has enough $$$
	if ((gold[0] + gold[1]) < cost)
	{
		client.printToChat("You don't have enough money! Cost: "+cost);
		return false;
	}
	// Buy item and deduce gold
	matrix[pID][item] += 1;
	
	// XXX dota.givePlayerGold(pID, -cost, 
	// Unreliable gold first...
	if (gold[1] >= cost)
		gold[1] -= cost;
	else
	{
		cost -= gold[1];
		gold[0] -= cost;
		gold[1] = 0;
	}
	
	data.netprops.m_iReliableGold[pID] = gold[0];
	data.netprops.m_iUnreliableGold[pID] = gold[1];
	
	client.printToChat(Shop.messages.on_buy.replace("%1", Shop.items[item].name).replace("%2",cost) + " level="+matrix[pID][item]);
	
	return true;
}
function getLevel(pID, item)
{
	check(pID, item);
	return matrix[pID][item];
}
function getCost(pID, item)
{
	check(pID, item);
	// TODO maybe exponential increase
	return parseInt(Shop.items[item].price_base + (matrix[pID][item] * Shop.items[item].price_incr));
}

exports.buy = buy;
exports.getCost = getCost;
exports.getLevel = getLevel;
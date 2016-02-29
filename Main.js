// PoorMansPudgeWars plugin for Dota2 SMJS by Fubar
// Some code taken from other plugins : LegendsOfDota, MidOnly, Dotax2, InstantRespawn, Blind...

// KV files which contains a bunch of configuration values, mostly balance stuff
var kv = keyvalue.parseKVFile('PudgeWars.kv');
var Shop = keyvalue.parseKVFile('Shop.kv');

// Modules
var Items = require('Items.js');

// Max number of players
var MAX_PLAYERS = 16;

// Holds the current level that each player has for the various hook attributes
var initialized = false;
var enforce_bounds = true;
var building_walls = false;
var equipped = new Array();
var welcomed = new Array();
var headshots = new Array();
var x_needs_cd = new Array();
var particles = new Array();
var hero_model = "";

var cvForceGameMode    = console.findConVar("dota_force_gamemode");
var cvEasyMode         = console.findConVar("dota_easy_mode");
var cvCreepsNoSpawning = console.findConVar("dota_creeps_no_spawning");
var cvAbilityDebug     = console.findConVar("dota_ability_debug");

var playerManager = null;

var MAX_SCORE = 50;
var score_radi = 0;
var score_dire = 0;

console.addClientCommand("pos", pos);
console.addClientCommand("radi", joinRadi);
console.addClientCommand("dire", joinDire);

console.addClientCommand("shop", shop);
for (var i in Shop.items)
{
	// Javascript scopes...
	var f = (function (a) {
		return function (client, args){ shop(client, args, a); };
	})(i);
	
	console.addClientCommand(Shop.items[i].command,  f);
}

var shop_list = "";
{
	var clr = 16;
	for (i in Shop.items)
	{
		shop_list += String.fromCharCode(clr++) + "-" + Shop.items[i].command + " " + Shop.items[i].name + "  ";
	}
}

game.hook("OnMapStart", onMapStart);
game.hook("OnGameFrame", onGameFrame);
game.hook("Dota_OnHeroPicked", Dota_OnHeroPicked);
game.hook("Dota_OnBuyItem", Dota_OnBuyItem);
game.hook("Dota_OnGetAbilityValue", Dota_OnGetAbilityValue);
game.hook("Dota_OnUnitParsed", Dota_OnUnitParsed);
game.hook("Dota_OnHeroSpawn", Dota_OnHeroSpawn);

game.hookEvent("dota_player_killed", onPlayerKilled);
game.hookEvent("entity_hurt", onEntityHurt, false);

var lobbyManager;
plugin.get('LobbyManager', function(obj){
	lobbyManager = obj;
	
	var max = parseInt(lobbyManager.getOptionsForPlugin('PMPW')['MaxScore']);
	if (max > 0 && max <= 1000)
		MAX_SCORE = max;
});

function shop(client, args, item)
{
	if (!item)
	{
		if (args.length > 0)
		{
			var found = false;
			var cmd = args[0];
			// Strip early -
			if (cmd.substring(0,1) == "-")
				cmd = cmd.substring(1);
			
			for (i in Shop.items)
			{
				if (args[0] == Shop.items[i].command)
				{
					client.printToChat("\x12"+Shop.items[i].name + "\x01 -> " + Shop.items[i].description + " \x15(cost: " + Items.getCost(client.netprops.m_iPlayerID, i) + ")");
					found = true;
					break;
				}
			}
			if (!found)
				client.printToChat("Item not found!");
			
		}
		else
		{
			client.printToChat(shop_list);
			client.printToChat(Shop.messages.shop);
		}
		
		return;
	}
	Items.buy(client, item);
}

function pos(client, args)
{
	var hero = client.netprops.m_hAssignedHero;
	client.printToChat(hero.netprops.m_vecOrigin.x + " " + hero.netprops.m_vecOrigin.y);
	
}

function joinRadi(client, args)
{
	client.fakeCommand("jointeam good");
}
function joinDire(client, args)
{
	client.fakeCommand("jointeam bad");
}

// TODO: also hook dota_combatlog for allied denies
// Sometimes this will fire twice for headshots, detect duplicate
var last_headshot = { attacker : 0, hurt_hero : 0, game_time : 0.0 };
function onEntityHurt(event)
{
	var inflictor = game.getEntityByIndex(event.getInt("entindex_inflictor"));
	var hurt_hero = game.getEntityByIndex(event.getInt("entindex_killed"));
	var attacker  = game.getEntityByIndex(event.getInt("entindex_attacker"));
	
	if (!inflictor || !attacker || !hurt_hero || !hurt_hero.isHero())
		return;
	
	if (inflictor.getClassname() != "pudge_meat_hook")
		return;
	
	if (dota.hasModifier(hurt_hero, "modifier_pudge_meat_hook"))
	{
		// Headshot!
		dota.applyDamage(attacker, hurt_hero, inflictor, 108875, dota.DAMAGE_TYPE_COMPOSITE);
		
		// Detect duplicate headshot
		if ((game.rules.props.m_fGameTime - last_headshot.game_time) < 1.0)
			if (last_headshot.attacker == attacker && last_headshot.hurt_hero == hurt_hero)
				return;
		
		last_headshot.attacker = attacker;
		last_headshot.hurt_hero = hurt_hero;
		last_headshot.game_time = game.rules.props.m_fGameTime;
		
		var splat = dota.createParticleEffect(hurt_hero, "chaos_knight_reality_rift", 1);
		var splat2 = dota.createParticleEffect(hurt_hero, "axe_culling_blade_kill", 1);
		var loc = hurt_hero.netprops.m_vecOrigin;
		
		var aPID = attacker.netprops.m_iPlayerID;
		if (!headshots[aPID]) headshots[aPID] = 0;
		headshots[aPID]++;
		
		var p1 = dota.findClientByPlayerID(aPID);
		var p2 = dota.findClientByPlayerID(hurt_hero.netprops.m_iPlayerID);
		
		var dire_killer = false;
		var name1 = "???";
		if (p1)
		{
			name1 = p1.getName();
			if (p1.netprops.m_iTeamNum == dota.TEAM_DIRE) dire_killer = true;
		}
		
		var name2 = "???";
		if (p2)
		{
			name2 = p2.getName();
			if (p2.netprops.m_iTeamNum == dota.TEAM_DIRE) dire_killer = false;
		}
		
		for (var i = 0; i < MAX_PLAYERS; i++)
		{
			if (server.clients[i] && server.clients[i].isInGame())
			{
				// sounds/vo/announcer_killing_spree/announcer_kill_holy_01.mp3 "DOTA_Item.Dagon.Activate"
				dota.sendAudio(server.clients[i], false, "announcer_killing_spree_announcer_kill_holy_01");
				server.clients[i].printToChat( (dire_killer?"\x12":"\x15") + name1 + "  \x09︻╦╤─  " + (dire_killer?"\x15":"\x12") + name2 + " \x09 !");
				
				for (var j = 0; j < 5; j++)
				{
					dota.setParticleControl(server.clients[i], splat, j, loc);
					dota.setParticleControl(server.clients[i], splat2, j, loc);
				}
			}
		}
	}
}

function onMapStart()
{
	initialized = false;
	equipped = new Array();
	welcomed = new Array();
	headshots = new Array();
	x_needs_cd = new Array();
	particles = new Array();
	hero_model = "";
	
	playerManager = game.findEntityByClassname(-1, "dota_player_manager");
	
	// Move T1 towers out of the way
	tower = game.findEntityByTargetname("dota_goodguys_tower1_mid");
	if (tower != null) tower.teleport(-5000, -5000, 128);
	tower = game.findEntityByTargetname("dota_badguys_tower1_mid");
	if (tower != null) tower.teleport(5000, 5000, 128);
	
	// Move ancients
	var ancient = game.findEntityByTargetname("dota_goodguys_fort");
	if (ancient != null) ancient.teleport(-1600, -1300, 128);

	ancient = game.findEntityByTargetname("dota_badguys_fort");
	if (ancient != null) ancient.teleport(1150, 650, 128);
	
	// Create the walls (disabled)
	/*
	building_walls = true;
	var map = kv.MapBounds;
	for (var i=0; i<map.length; i++)
	{
		var next = map[(i+1) % map.length];
		var dir = (map[i].x < next.x) ? 1 : -1;
		var ratio = (next.y - map[i].y) / (next.x - map[i].x);
		// spacing = 100
		var dx = 100 / Math.sqrt(ratio*ratio + 1);
		var dy = ratio * dx;
		var x = map[i].x;
		var	y = map[i].y;
		
		while (0 > dir * (x - next.x))
		{
			var b = dota.createUnit("dota_goodguys_fillers", dota.TEAM_NEUTRAL);
			b.teleport(x, y, 64);
			x += dx * dir;
			y += dy * dir;
		}
	}
	building_walls = false;
	*/
	// Move shrines to gief vision and block peeps
	var x = game.findEntitiesByClassname("npc_dota_building");
	var radi_mid = 0;
	var radi_idx = 0;
	var dire_mid = 0;
	var dire_idx = 0;
	// This code is kinda ugly but it works
	for (var i = 0; i < x.length; i++)
	{
		if (x[i].netprops.m_iTeamNum == dota.TEAM_DIRE) // dire
		{
			if (x[i].netprops.m_nModelIndex == 234)
			{
				x[i].teleport(96 - 150*dire_mid, -96 + 150*dire_mid, 0);
				dire_mid++;
			}
		}
		else if (x[i].netprops.m_iTeamNum == dota.TEAM_RADIANT)
		{
			if (x[i].netprops.m_nModelIndex == 218 && radi_mid < 5)
			{
				x[i].teleport(-1240 + 110*radi_mid, -400 - 90*radi_mid, 0);
				radi_mid++;
			}
		}
	}
}

function onGameFrame()
{
	if (!initialized)
	{
		// These have to be put here because hibernation wakeup will overwrite stuff from OnMapStart
		cvForceGameMode.setInt(1);   // Mid Only mode = 11, AP = 1
		cvCreepsNoSpawning.setInt(1); // No creeps
		//cvAbilityDebug.setInt(1);     // WTF mode
		//cvEasyMode.setInt(1);         // Easymode (disabled because doesn't add anything)
		
		// All heroes are unavailable!
		for (var i = 0; i < 110; i++)
			dota.setHeroAvailable(i, false);
		
		for (var i in kv.HeroID)
			dota.setHeroAvailable(kv.HeroID[i], true);
	}
	
	// TODO: use this...
	var player_teams = playerManager.netprops.m_iPlayerTeams;
	
	for(var i = 0; i < server.clients.length; ++i){
		if(server.clients[i] == null) continue;
		//if(!server.clients[i].isInGame()) continue;
		
		var pID = server.clients[i].netprops.m_iPlayerID;
		if(pID == -1) continue;
		var hero = server.clients[i].netprops.m_hAssignedHero;
		if(hero == null) continue;
		
		var game_time = game.rules.props.m_fGameTime;
		
		// Passive HP/MP regeneration
		hero.netprops.m_iHealth += kv.GameProps.HPregen;
		// Mana "overflows" in a buggy way compared to health, so only increase if its not full
		var mana = hero.netprops.m_flMana;
		if (mana < hero.netprops.m_flMaxMana)
			hero.netprops.m_flMana = mana + kv.GameProps.MPregen;
			
		// PLAYER ABILITIES
		var abs = hero.netprops.m_hAbilities;
		if (abs)
		{
			// Swap never calls onGetAbilityValue, so change to cooldown the old way
			var swap_cd = kv.AbilityVals.vengefulspirit_nether_swap.cooldown[abs[3].netprops.m_iLevel - 1];
			if (abs[3].netprops.m_fCooldown > (game_time + swap_cd))
			{
				dota.endCooldown(abs[3]);			
				if (cvAbilityDebug.getInt() != 1)
				{
					abs[3].netprops.m_fCooldown = game_time + swap_cd;
					abs[3].netprops.m_flCooldownLength = swap_cd;
				}
			}
			
			// We have to set custom X cooldown after the end of the spell so that Return stays available
			if (x_needs_cd[pID])
			{
				var xmarks = x_needs_cd[pID];
				var real_cd = 13;
				
				// Return used
				if (xmarks.netprops.m_iManaCost == abs[1].netprops.m_iManaCost)
				{
					x_needs_cd[pID] = null;
					var cd = xmarks.netprops.m_fCooldown;
					dota.endCooldown(xmarks);
					if (cvAbilityDebug.getInt() != 1)
					{
						cd -= real_cd;
						cd += kv.AbilityVals.kunkka_x_marks_the_spot.cooldown[xmarks.netprops.m_iLevel - 1];
						
						xmarks.netprops.m_fCooldown = cd;
						xmarks.netprops.m_flCooldownLength = cd - game_time;
					}
				}
			}
		}
		// Short respawn timer
		if ((hero.netprops.m_flRespawnTime - game_time) > kv.GameProps.ResTime)
			hero.netprops.m_flRespawnTime = game_time + kv.GameProps.ResTime;

		var p = hero.netprops.m_vecOrigin;
		if (p)
		{
			var px = p.x;
			var py = p.y;
			var len = kv.MapBounds.length;
			
			// Stuck spot by radiant ancients TODO add a couple more stuck spots or fix them
			if (px >= -2097.0 && px <= -2080.0 && py <= 375.0 && py >= 304.0)
				respawnHero(hero);
			// Fountain
			else if ((px >= 5000 && py >= 5000) || (px <= -5000 && py <= -5000))
				respawnHero(hero);
			else
			{
				// Bound player positions
				if (enforce_bounds && !dota.hasModifier(hero, "modifier_pudge_meat_hook"))
				{
					for (var j = 0; j < len; j++)
					{
						if (isPointLeftOfLine(px, py, kv.MapBounds[j].x, kv.MapBounds[j].y, kv.MapBounds[(j+1) % len].x, kv.MapBounds[(j+1) % len].y))
						{
							var newpos = projectPointOnLine(px, py, kv.MapBounds[     j     ].x, kv.MapBounds[     j     ].y,
																	kv.MapBounds[(j+1) % len].x, kv.MapBounds[(j+1) % len].y);
							
							dota.findClearSpaceForUnit(hero, newpos.x, newpos.y, 0);
						}
					}
				}
			}
		}
		
		if (!server.clients[i].isInGame()) continue;
		if (!welcomed[pID])
		{
			welcomed[pID] = true;
			server.clients[i].printToChat("Welcome to Poor Man's Pudge Wars.");
			server.clients[i].printToChat("All heroes have the same stats.");
			server.clients[i].printToChat("The first team to "+MAX_SCORE+" kills wins");
			server.clients[i].printToChat("\x12There is now a shop!! Type -shop");
			server.clients[i].printToChat("Enjoy!");
		}
	}
}

// In these 2 functions, the (directed) line is defined by a vector going from (x1, y1) to (x2, y2)

// http://stackoverflow.com/a/2752753
function isPointLeftOfLine(xp, yp, x1, y1, x2, y2)
{
	var v = (x2 - x1) * (yp - y1) - (y2 - y1) * (xp - x1);
	return -2000 >= v;
}
// http://en.wikibooks.org/wiki/Linear_Algebra/Orthogonal_Projection_Onto_a_Line
function projectPointOnLine(xp, yp, x1, y1, x2, y2)
{
	var s = { x : x1 - x2,
	          y : y1 - y2 };
	var v = { x : xp - x1,
	          y : yp - y1 };
			  
	var c = (s.x * v.x + s.y * v.y) / (s.x * s.x + s.y * s.y);
	
	return { x : x1 + c * s.x,
	         y : y1 + c * s.y };
}

function respawnHero(hero)
{
	var spawns = (hero.netprops.m_iTeamNum == dota.TEAM_DIRE) ? kv.PlayerSpawns.dire : kv.PlayerSpawns.radiant;
	var idx = Math.floor(Math.random() * spawns.length);
	var dx = Math.random() * 400 - 200;
	var dy = Math.random() * 400 - 200;
	dota.findClearSpaceForUnit(hero, spawns[idx].x + dx, spawns[idx].y + dy, 0);
	dota.executeOrders(hero.netprops.m_iPlayerID, dota.ORDER_TYPE_MOVE_TO_LOCATION, [hero], null, null, false, hero.netprops.m_vecOrigin.x, hero.netprops.m_vecOrigin.y, hero.netprops.m_vecOrigin.z);
}

function Dota_OnHeroSpawn(hero)
{
	respawnHero(hero);
	dota.endCooldown(hero.netprops.m_hAbilities[0]);
	
	var pID = hero.netprops.m_iPlayerID
	if (!equipped[pID])
	{
		equipped[pID] = true;
		
		dota.giveItemToHero("item_urn_of_shadows", hero);
		dota.giveItemToHero("item_quelling_blade", hero);
		dota.giveItemToHero("item_branches", hero);
		dota.giveItemToHero("item_tranquil_boots", hero);
		dota.giveItemToHero("item_soul_ring", hero);
		dota.giveItemToHero("item_blink", hero);
		
		// Advance game time... Doesn't seem to be working here -.-
		if (game.rules.props.m_flGameTime < 90.0)
		{
			print("Game time from "+game.rules.props.m_flGameTime+" to 90.0");
			game.rules.props.m_flGameTime = 90.0;
		}
		
		// ABILITIES
		var abs = hero.netprops.m_hAbilities;
		
		// Cast range
		game.hookEnt(abs[0], dota.ENT_HOOK_GET_CAST_RANGE, function(){ return 100 + Shop.items.hook_distance.value_base + Shop.items.hook_distance.value_incr * Items.getLevel(pID, "hook_distance");; } ); // hook
		game.hookEnt(abs[3], dota.ENT_HOOK_GET_CAST_RANGE, function(){ return kv.AbilityVals.vengefulspirit_nether_swap.cast_range[abs[3].netprops.m_iLevel - 1]; } ); // swap
		
		// Cast points
		game.hookEnt(abs[0], dota.ENT_HOOK_GET_CAST_POINT, function(){return 0.2; }); // hook
		game.hookEnt(abs[1], dota.ENT_HOOK_GET_CAST_POINT, function(){return 0.0; }); // X
		game.hookEnt(abs[3], dota.ENT_HOOK_GET_CAST_POINT, function(){return 0.0; }); // swap
		game.hookEnt(abs[5], dota.ENT_HOOK_GET_CAST_POINT, function(){return 0.0; }); // return (not sure this is needed)
	}
}

function Dota_OnHeroPicked(client, clsname)
{
	var pID = client.netprops.m_iPlayerID;
	print("PlayerID "+pID+" picked "+clsname+" model="+kv.HeroModels[clsname]);
}

function Dota_OnBuyItem(unit, item, playerID, unknown)
{
	// Can't buy any items
	dota.findClientByPlayerID(playerID).printToChat("No items allowed.");
	return false;
}

function onPlayerKilled(event)
{
	var playerId = event.getInt("PlayerID");
    var client = dota.findClientByPlayerID(playerId);
	if (client == null) return;
	var hero = client.netprops.m_hAssignedHero;
	if (hero == null) return;
	if (hero.netprops.m_iTeamNum == dota.TEAM_DIRE) score_radi++;
	if (hero.netprops.m_iTeamNum == dota.TEAM_RADIANT) score_dire++;
	
	client.printToChat(Shop.messages.on_death);
	
	print("SCORE: "+score_radi+"-"+score_dire);
	
	if (score_radi >= MAX_SCORE)
	{
		// Radiant win!
		pmpw_game_end(dota.TEAM_RADIANT);
	}
	else if (score_dire >= MAX_SCORE) {
		// Dire win!
		pmpw_game_end(dota.TEAM_DIRE);
	}
}

function pmpw_game_end(loser)
{
	var wintxt = (loser == dota.TEAM_DIRE) ? "Radiant" : "Dire";
	
	var max_headshots = 0;
	for (var h in headshots)
		if (headshots[h] > max_headshots)
			max_headshots = headshots[h];
	
	var headshot_playa = "";
	if (max_headshots > 0)
	{
		var clr = 18; // colour of player names in chat, auto-incremented below
		for (var h in headshots)
			if (headshots[h] == max_headshots && dota.findClientByPlayerID(parseInt(h)))
				headshot_playa += ", "+ String.fromCharCode(clr++) + dota.findClientByPlayerID(parseInt(h)).getName();
		
		headshot_playa = headshot_playa.substring(2);
	}
	
	for(var i = 0; i < server.clients.length; ++i)
	{
		if(server.clients[i] == null) continue;
		if(!server.clients[i].isInGame()) continue;
		
		server.clients[i].printToChat(wintxt + " wins!");
		server.clients[i].printToChat("Thanks for playing PMPW :)");
		if (max_headshots > 0)
			server.clients[i].printToChat("Most headshots : "+headshot_playa+" with "+max_headshots+"!");
		else
			server.clients[i].printToChat("No headshots this game! Shame on you guys...");
		//server.clients[i].printToChat("If you have any feedback, go to reddit.com/r/PMPW");
	}
	dota.forceWin(loser);
}

function Dota_OnGetAbilityValue(ability, abilityName, field, values)
{
	// These get spam queried all the time so filter them out
	if (abilityName == "backdoor_protection" || abilityName == "backdoor_protection_in_base") return;
	
	var pID = ability.netprops.m_hOwnerEntity.netprops.m_iPlayerID;
	
	if (!dota.findClientByPlayerID(pID)) return;
	
	if (kv.AbilityVals[abilityName] != null)
	{
		// Custom cooldowns, can't apply X marks here because of Return spell
		if (kv.AbilityVals[abilityName].cooldown != null && abilityName != "kunkka_x_marks_the_spot")
		{
			if (kv.AbilityVals[abilityName].cooldown_field == null || kv.AbilityVals[abilityName].cooldown_field == field)
			{
				dota.endCooldown(ability);
				// Don't set a cooldown in WTF mode
				if (cvAbilityDebug.getInt() != 1)
				{
					var cd = kv.AbilityVals[abilityName].cooldown[ability.netprops.m_iLevel-1]
					ability.netprops.m_fCooldown = game.rules.props.m_fGameTime + cd;
					ability.netprops.m_flCooldownLength = cd;
				}
			}
		}
		else if (abilityName == "kunkka_x_marks_the_spot" && field == "fow_range")
		{
			x_needs_cd[pID] = ability;
		}
		
		// Special case for hook -> SHOP
		if (abilityName == "pudge_meat_hook" && Shop.items[field])
		{
			var new_val = Shop.items[field].value_base + Shop.items[field].value_incr * Items.getLevel(pID, field);
			for (var i=0; i<values.length; i++)
				values[i] = new_val;
			
			return values;
		}
		
		var f = kv.AbilityVals[abilityName][field];
		if (f != null)
		{
			if (values.length == 1 && f.length == 4)
				values[0] = f[ability.netprops.m_iLevel-1];
			else
				values = f;
			
			return values;
		}
	}
}

function Dota_OnUnitParsed(unit, keyvalues)
{
	if (!unit) return;
	// Reduced vision range for all units (creeps, towers, heroes, etc.)
	keyvalues.VisionDaytimeRange   = kv.GameProps.Vision;
	keyvalues.VisionNighttimeRange = kv.GameProps.Vision;
	
	// Map walls
	if (unit.getClassname() == "npc_dota_building" && building_walls)
	{
		keyvalues.TeamName = "DOTA_TEAM_NEUTRALS";
		//keyvalues.Model = "models/props_structures/good_statue008.mdl";
		keyvalues.VisionDaytimeRange = 0;
		keyvalues.VisionNighttimeRange = 0;
	}
	
	// Skip non-hero units
	if(dota.heroes.indexOf(unit.getClassname()) == -1) return;
	
	// Other vision range for heroes
	keyvalues.VisionDaytimeRange   = kv.GameProps.HeroVision;
	keyvalues.VisionNighttimeRange = kv.GameProps.HeroVision;
	
	// All heroes get the same attributes for balance
	keyvalues.ArmorPhysical = "-1"
	
	keyvalues.MovementTurnRate = "3.0";
	keyvalues.MovementSpeed = "285";
	
	keyvalues.AttackDamageMin = "80";
	keyvalues.AttackDamageMax = "80";
	keyvalues.AttackRate = "1.5";
	keyvalues.AttackRange = "128";
	keyvalues.AttackAnimationPoint = "0.4";
	keyvalues.AttackAcquisitionRange = "600";
	keyvalues.AttackCapabilities = "DOTA_UNIT_CAP_MELEE_ATTACK";
	
	keyvalues.AttributePrimary = "DOTA_ATTRIBUTE_STRENGTH";
	keyvalues.AttributeBaseStrength = "25";
	keyvalues.AttributeStrengthGain = "3.2";
	keyvalues.AttributeBaseIntelligence = "14";
	keyvalues.AttributeIntelligenceGain = "1.5";
	keyvalues.AttributeBaseAgility = "14";
	keyvalues.AttributeAgilityGain = "1.5";
	
	// Give same sound FX for teh moment
	keyvalues.GameSoundsFile = "scripts/game_sounds_heroes/game_sounds_pudge.txt"
	keyvalues.VoiceFile = "scripts/voscripts/game_sounds_vo_pudge.txt";
	
	// Change abilities
	keyvalues.Ability1 = "pudge_meat_hook";
	keyvalues.Ability2 = "kunkka_x_marks_the_spot";
	keyvalues.Ability3 = "rattletrap_rocket_flare";
	keyvalues.Ability4 = "vengefulspirit_nether_swap";
	// Ability5 is stats
	keyvalues.Ability6 = "kunkka_return";
	keyvalues.AbilityLayout = "5";
	
	print("Parsed hero model: "+hero_model);
	//if (hero_model) keyvalues.Model = hero_model;
	hero_model = "";
	
	// Need to load these manually
	game.precacheModel("models/heroes/pudge/pudge_hook.mdl");
	game.precacheModel("models/heroes/rattletrap/rattletrap_rocket.mdl");
	game.precacheModel("models/heroes/vengeful/vengeful_terror_head.mdl");
	dota.loadParticleFile("particles/units/heroes/hero_pudge.pcf");
	dota.loadParticleFile("particles/units/heroes/hero_kunkka.pcf");
	dota.loadParticleFile("particles/units/heroes/hero_rattletrap.pcf");
	dota.loadParticleFile("particles/units/heroes/hero_vengeful.pcf");
	dota.loadParticleFile("particles/units/heroes/hero_chaos_knight.pcf"); // For Headshot effect
	dota.loadParticleFile("particles/units/heroes/hero_axe.pcf"); // For Headshot effect
}

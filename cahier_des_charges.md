Cahier des Charges : Générateur d'Itinéraires Sportifs
1. Contexte et Objectifs du Projet
L'objectif est de développer une application web cartographique permettant de générer automatiquement des itinéraires sur mesure pour le cyclisme sur route et la course à pied. L'utilisateur doit pouvoir définir des points de départ et d'arrivée, ainsi que des contraintes précises (distance, temps, dénivelé) pour obtenir des tracés optimisés, exportables vers des équipements GPS.

2. Choix Technologiques (Orientés "Mobile-Ready")
Pour répondre au besoin d'une application web évolutive vers du mobile natif par la suite, l'architecture doit séparer la logique de l'interface.

Frontend : L'utilisation de React (idéalement couplé à Next.js pour la structure et l'optimisation) est recommandée. Cela facilitera grandement le portage futur vers une application mobile via React Native, en réutilisant une grande partie de la logique métier.

Cartographie : Mapbox GL JS ou Leaflet. Ces bibliothèques offrent d'excellentes performances sur mobile comme sur desktop et permettent d'afficher des fonds de carte adaptés au sport (cartes topographiques ou routières).

Moteur de routage et Géocodage : Des API comme OpenRouteService, GraphHopper ou Mapbox Directions API. Il est crucial de choisir un moteur qui gère les profils spécifiques (ex: "vélo de route" pour exclure strictement les chemins de terre, ou "piéton" pour la course à pied).

3. Spécifications Fonctionnelles
3.1. Interface Principale
Carte interactive occupant la majeure partie de l'écran.

Panneau de contrôle (latéral sur desktop, en tiroir/bottom-sheet sur mobile) pour la saisie des paramètres.

L'interface web doit être strictement pensée en Mobile-First pour que l'expérience sur smartphone soit déjà proche d'une application native (PWA - Progressive Web App).

3.2. Saisie des Points géographiques
Point de départ : Saisie d'une adresse textuelle (via autocomplétion) OU utilisation de la géolocalisation de l'appareil ("Ma position").

Point d'arrivée : Saisie d'une adresse textuelle OU position actuelle.

Règle métier : Si l'adresse de départ est identique à l'adresse d'arrivée (ou si seul le point de départ est renseigné), le système génère une boucle. Sinon, il génère un itinéraire de point A à point B.

3.3. Paramétrage du Tracé
L'utilisateur doit pouvoir sélectionner son sport (Vélo de route ou Course à pied) et définir une ou plusieurs de ces variables pour le calcul :

Objectif de Distance : En kilomètres (ex: une sortie longue de 200 km ou un footing de 10 km).

Objectif de Temps : L'utilisateur entre une durée souhaitée et sa vitesse moyenne estimée (le système convertit cela en distance cible en arrière-plan).

Objectif de Dénivelé (D+) : Tolérance ou cible de dénivelé positif pour durcir ou adoucir le parcours.

3.4. Restitution et Interaction avec le Parcours
Affichage du tracé directement sur la carte.

Résumé des métriques : Distance réelle calculée, Dénivelé positif (D+) et Dénivelé négatif (D-), estimation du temps.

Profil altimétrique : Un graphique interactif sous la carte permettant de visualiser les ascensions.

Génération itérative (Fonctionnalité "Regénérer") :

Si le tracé initialement proposé ne satisfait pas l'utilisateur (par exemple : la boucle part vers le nord alors qu'il préfère le sud, ou le tracé emprunte une route connue pour être désagréable), un bouton d'action bien visible doit lui permettre de solliciter une nouvelle proposition.

Règle métier pour le développement : Le clic sur ce bouton doit forcer le moteur de routage à trouver une alternative. Cela peut s'implémenter en introduisant un point de passage aléatoire (waypoint invisible) dans un rayon calculé selon la distance cible, ou en appliquant une pénalité temporaire sur les segments du parcours précédent.

Cette action doit pouvoir être répétée autant de fois que l'utilisateur le souhaite, jusqu'à obtention d'un parcours idéal.

Historique de session (Optionnel pour la V1) : Idéalement, l'utilisateur devrait pouvoir revenir au tracé précédent s'il décide finalement que celui-ci était le meilleur.

3.5. Exportation
Génération et téléchargement immédiat du fichier au format .gpx (standard universel compatible avec tous les compteurs de vélo et montres de sport du marché).

4. Exigences Non-Fonctionnelles
Performance du routage : La génération de l'itinéraire (qui nécessite des calculs lourds de la part de l'API de routage) doit s'afficher en moins de 3 à 5 secondes pour maintenir une bonne expérience utilisateur.

Précision des données : L'algorithme doit éviter au maximum les routes à forte circulation pour le vélo de route, et privilégier les axes sécurisés.

Responsive : Le tiroir de paramètres ne doit pas bloquer la visibilité du parcours généré sur les petits écrans.

5. Évolutions Futures (V2 et passage Mobile)
Ce périmètre est exclu de la V1 mais doit être gardé en tête lors du développement web :

Création de l'application mobile native (iOS/Android).

Système de comptes utilisateurs avec historique des parcours générés.

Synchronisation API directe avec des plateformes tierces pour envoyer le tracé directement sur l'appareil (API Garmin Connect, Wahoo, ou Strava).
# FF TOURNAMENT MANAGER

## Présentation Générale
**FF TOURNAMENT MANAGER** est une plateforme de gestion de tournois dédiée au jeu **Free Fire**. Le site permet à un administrateur de créer, gérer et automatiser des compétitions (gratuites ou payantes) tout en offrant aux joueurs un espace pour s'inscrire, suivre leurs performances et réclamer leurs récompenses.

## Fonctionnalités Principales

| Catégorie | Description des fonctionnalités |
| :--- | :--- |
| **Gestion des Tournois** | Création de plusieurs tournois simultanés avec paramètres modifiables (nombre d'équipes, matchs, phases éliminatoires). Affichage dynamique des tournois disponibles avec compte à rebours. |
| **Espace Joueur** | Inscription rapide (solo ou équipe) avec saisie obligatoire de l'ID Free Fire. Accès à un historique personnel, aux statistiques (kills, MVP) et aux résultats des matchs. |
| **Système de Récompenses** | Gestion de récompenses variées (Booyah Pass, abonnements, diamants de 100d à 10000d). Les tournois payants incluent un processus de vérification des paiements par l'admin. |
| **Analyse & IA** | Intégration d'une **IA** capable d'analyser des captures d'écran (PNG) des résultats de match pour extraire automatiquement les statistiques (kills, gagnants). |
| **Interaction & Support** | Système de réclamations avec preuves (screenshots), notifications par email via EmailJS, et boutons de contact rapide pour joindre l'administrateur. |

## Aspects Techniques & Administration
*   **Interface Admin :** Un espace sécurisé par code spécial permettant de valider les inscriptions, gérer les flux financiers des récompenses et modérer les réclamations.
*   **Expérience Utilisateur :** Le site propose un mode sombre (dark mode), une musique d'ambiance personnalisable et une structure exportable sur Netlify.
*   **Automatisation :** Utilisation de diagrammes pour le suivi des phases (8e, quarts, etc.) et mise à jour automatique des statuts de tournois (en cours, expiré).

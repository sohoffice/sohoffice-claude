# Print all available commands
help:
    @just --list

# Copy the skills in skills/ to ~/.claude/skills, deleting what the repo deleted; stops on changes made there
deploy-skills force="":
    @scripts/skills.sh deploy {{force}}

# Report changes made in ~/.claude/skills outside this repo since the last deploy
check-skills:
    @scripts/skills.sh check

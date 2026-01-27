# New Feature: Multi-Agent System with RAG

## Overview
This feature expands the current single-prompt "SDR IA" into a full Multi-Agent system. Users will be able to create multiple AI agents, configure their personalities (prompts), manages their knowledge base (files for RAG), and select which agent is active for the Live Chat.

The existing "IA Helper" functionality will be preserved as a separate utility.

## User Interface

### 1. Unified AI Settings Page (`SettingsView > AI`)
The current `AIAgent.tsx` view will be refactored to:
- **Section 1: IA Helper**: Keep the existing helper prompt configuration. This assumes "IA Helper" is internal/personal.
- **Section 2: Atendimento Automático (Live Chat)**: A new section replacing the old "SDR IA".
    - Displays the **Active Live Chat Agent** prominently.
    - Allows switching the active agent or disabling auto-response entirely.
    - Lists all available agents.

### 2. Agent Management (`AIAgentsSettingsView`)
A list view of all agents with:
- **Hero Card**: Highlights the currently active/default agent.
- **Agent List**: Compact cards for other agents.
- **Actions**:
    - **Create New Agent**: Opens the creation modal.
    - **Edit**: Opens the configuration modal.
    - **Toggle Active**: Quickly enable/disable an agent.
    - **Set as Default**: Selects the agent for Live Chat.
    - **Test**: Opens a chat simulation.

### 3. Agent Configuration Modal (`AIAgentForm`)
A tabbed modal window for deep configuration:
- **Tab 1: Persona & Behavior**:
    - Name, Role, System Prompt.
    - LLM Model selection (GPT-4, Gemini, etc.).
    - Creativity (Temperature) and Max Tokens.
    - Handoff instructions (when to transfer to a human).
- **Tab 2: Knowledge Base (RAG)**:
    - **Upload Area**: Drag & drop files (PDF, TXT, DOCX, etc.).
    - **File List**: Shows processing status (Indexing, Ready, Error).
    - **Settings**: Chunk size, Similarity threshold (advanced).
- **Tab 3: Advanced**:
    - Debounce settings.
    - Booking tool validaton.

### 4. Chat Simulation (`AIAgentTestChat`)
A built-in chat window to test the agent's responses and RAG retrieval before deploying it to real customers.

## Data Model

We will utilize the existing schema found in `features/smartzap`:

### `ai_agents` table
- `id`: UUID
- `name`: String
- `system_prompt`: Text
- `model`: String (e.g., 'gpt-4')
- `is_default`: Boolean (Indicates the Live Chat agent)
- `rag_config`: JSON (Thresholds, top_k)
- ...

### `ai_knowledge_files` table
- `id`: UUID
- `agent_id`: UUID
- `file_name`: String
- `content`: Text (Extracted text)
- `embedding_status`: String ('pending', 'completed')
- ...

## Integration Architecture

1.  **Backend API**:
    - Reuse/Port `services/aiAgentService.ts` and `app/api/ai-agents/` routes.
    - Ensure RAG processing (embedding generation) is active.

2.  **Frontend State**:
    - Use React Query (`useAIAgents`, `useKnowledgeBase`) for state management.
    - Migrate components from `features/smartzap` to the main `components/features/ai-agents/` directory.

## Implementation Steps

1.  **Setup & Migration**:
    - Verify `ai_agents` and `ai_knowledge_files` tables in Supabase.
    - Copy API routes and Services from `features/smartzap` to main application structure.
    - Move UI components (`AIAgentsSettingsView`, `AIAgentForm`, `KnowledgeBasePanel`) to `components/features/ai-agents`.

2.  **UI Integration**:
    - Modify `AIAgent.tsx` to validade user license/plan (if applicable).
    - Render `AIAgentsSettingsView` inside `AIAgent.tsx`.
    - Wire up the "IA Helper" to remain independent.

3.  **Knowledge Base Integration**:
    - Integrate `KnowledgeBasePanel` into `AIAgentForm` (likely as a new Tab).
    - Ensure file upload endpoint handles text extraction (PDF/DOCX parsing).

4.  **Live Chat Hook**:
    - Configure the WhatsApp/Live Chat webhook to fetch the agent where `is_default = true`.
    - Pass the incoming message + relevant Knowledge Base chunks to the LLM.

5.  **Testing**:
    - Create a test agent.
    - Upload a knowledge document.
    - Verify "Test Chat" retrieves information from the document.

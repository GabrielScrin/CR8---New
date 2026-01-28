'use client'

import React, { useState } from 'react'
import { FileText, Upload, Trash2, Database, Loader2, Sparkles, File } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AIKnowledgeFile } from '@/types'
import { cn } from '@/lib/utils'

interface KnowledgeBaseSectionProps {
    files: AIKnowledgeFile[]
    onUpload: (file: File) => Promise<void>
    onDelete: (fileId: string) => Promise<void>
    isUploading?: boolean
}

export function KnowledgeBaseSection({
    files,
    onUpload,
    onDelete,
    isUploading
}: KnowledgeBaseSectionProps) {
    const [isDragging, setIsDragging] = useState(false)

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            await onUpload(file)
        }
    }

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
        const file = e.dataTransfer.files?.[0]
        if (file) {
            await onUpload(file)
        }
    }

    return (
        <div className="space-y-6">
            <div className="relative py-2">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                    <div className="w-full border-t border-zinc-800/80"></div>
                </div>
                <div className="relative flex justify-start">
                    <span className="bg-[#0a0c10] pr-4 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-500 flex items-center gap-2">
                        <Database className="h-3.5 w-3.5" />
                        Base de Conhecimento (RAG)
                    </span>
                </div>
            </div>

            {/* Upload Area */}
            <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={cn(
                    "relative group cursor-pointer border-2 border-dashed rounded-2xl p-8 transition-all duration-300",
                    isDragging
                        ? "border-primary-500 bg-primary-500/5"
                        : "border-zinc-800 bg-zinc-900/20 hover:border-zinc-700 hover:bg-zinc-800/30"
                )}
            >
                <input
                    type="file"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    accept=".pdf,.docx,.txt"
                />
                <div className="flex flex-col items-center justify-center text-center space-y-3">
                    <div className="h-12 w-12 rounded-xl bg-zinc-800 flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner">
                        {isUploading ? (
                            <Loader2 className="h-6 w-6 text-primary-500 animate-spin" />
                        ) : (
                            <Upload className="h-6 w-6 text-zinc-400 group-hover:text-primary-500" />
                        )}
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-zinc-200">
                            {isUploading ? 'Processando documento...' : 'Clique ou arraste para subir'}
                        </p>
                        <p className="text-xs text-zinc-500 mt-1">
                            Suporta PDF, DOCX ou TXT (Máx 10MB)
                        </p>
                    </div>
                </div>
            </div>

            {/* Documents List */}
            <div className="space-y-2">
                {files.length === 0 ? (
                    <div className="text-center py-8 rounded-2xl border border-zinc-800/50 bg-zinc-900/10">
                        <FileText className="h-8 w-8 text-zinc-700 mx-auto mb-2 opacity-20" />
                        <p className="text-xs text-zinc-600">Nenhum documento anexado ainda</p>
                    </div>
                ) : (
                    files.map((file) => (
                        <div
                            key={file.id}
                            className="flex items-center justify-between p-4 rounded-xl border border-zinc-800/50 bg-zinc-900/30 hover:bg-zinc-800/40 transition-colors group"
                        >
                            <div className="flex items-center gap-3">
                                <div className="h-9 w-9 rounded-lg bg-zinc-800/50 flex items-center justify-center border border-zinc-700/50">
                                    <File className="h-4 w-4 text-zinc-400" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-zinc-200 truncate max-w-[200px]">
                                        {file.name}
                                    </p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[10px] text-zinc-500">
                                            {(file.size_bytes / 1024).toFixed(1)} KB
                                        </span>
                                        <span className="text-[10px] text-zinc-700">•</span>
                                        <span className={cn(
                                            "text-[10px] flex items-center gap-1",
                                            file.indexing_status === 'completed' ? "text-emerald-500" :
                                                file.indexing_status === 'failed' ? "text-red-500" : "text-amber-500"
                                        )}>
                                            {file.indexing_status === 'completed' && <Sparkles className="h-2.5 w-2.5" />}
                                            {file.indexing_status === 'completed' ? 'Indexado' :
                                                file.indexing_status === 'failed' ? 'Falhou' : 'Processando'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onDelete(file.id)}
                                className="h-8 w-8 text-zinc-600 hover:text-red-500 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}

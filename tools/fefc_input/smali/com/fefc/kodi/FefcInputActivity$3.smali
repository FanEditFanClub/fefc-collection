.class Lcom/fefc/kodi/FefcInputActivity$3;
.super Ljava/lang/Object;
.source "FefcInputActivity.java"

# interfaces
.implements Landroid/content/DialogInterface$OnClickListener;


# annotations
.annotation system Ldalvik/annotation/EnclosingMethod;
    value = Lcom/fefc/kodi/FefcInputActivity;->onCreate(Landroid/os/Bundle;)V
.end annotation

.annotation system Ldalvik/annotation/InnerClass;
    accessFlags = 0x0
    name = null
.end annotation


# instance fields
.field final synthetic this$0:Lcom/fefc/kodi/FefcInputActivity;


# direct methods
.method constructor <init>(Lcom/fefc/kodi/FefcInputActivity;)V
    .registers 2

    .line 62
    iput-object p1, p0, Lcom/fefc/kodi/FefcInputActivity$3;->this$0:Lcom/fefc/kodi/FefcInputActivity;

    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    return-void
.end method


# virtual methods
.method public onClick(Landroid/content/DialogInterface;I)V
    .registers 3

    .line 63
    iget-object p1, p0, Lcom/fefc/kodi/FefcInputActivity$3;->this$0:Lcom/fefc/kodi/FefcInputActivity;

    const-string p2, "CANCEL"

    # invokes: Lcom/fefc/kodi/FefcInputActivity;->finishWith(Ljava/lang/String;)V
    invoke-static {p1, p2}, Lcom/fefc/kodi/FefcInputActivity;->access$000(Lcom/fefc/kodi/FefcInputActivity;Ljava/lang/String;)V

    return-void
.end method

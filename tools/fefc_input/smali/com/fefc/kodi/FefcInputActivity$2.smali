.class Lcom/fefc/kodi/FefcInputActivity$2;
.super Ljava/lang/Object;
.source "FefcInputActivity.java"

# interfaces
.implements Landroid/content/DialogInterface$OnCancelListener;


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

    .line 65
    iput-object p1, p0, Lcom/fefc/kodi/FefcInputActivity$2;->this$0:Lcom/fefc/kodi/FefcInputActivity;

    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    return-void
.end method


# virtual methods
.method public onCancel(Landroid/content/DialogInterface;)V
    .registers 3

    .line 66
    iget-object p1, p0, Lcom/fefc/kodi/FefcInputActivity$2;->this$0:Lcom/fefc/kodi/FefcInputActivity;

    const-string v0, "CANCEL"

    # invokes: Lcom/fefc/kodi/FefcInputActivity;->finishWith(Ljava/lang/String;)V
    invoke-static {p1, v0}, Lcom/fefc/kodi/FefcInputActivity;->access$000(Lcom/fefc/kodi/FefcInputActivity;Ljava/lang/String;)V

    return-void
.end method
